import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAdminResponse, createAdminConfig } from "../admin/server.js";
import { ADMIN_SESSION_HEADER, createAdminSession } from "../admin/session.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbar-admin-example-"));

try {
    const contentRoot = path.join(root, "content");
    const auditRoot = path.join(root, "audit");
    const publicAssetRoot = path.join(root, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot, { recursive: true });
    await fs.mkdir(publicAssetRoot, { recursive: true });
    await fs.writeFile(path.join(contentRoot, "documents", "resume-main.json"), `${JSON.stringify({
        id: "resume-main",
        type: "resume",
        slug: "resume-main",
        status: "draft",
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
        publishedAt: null,
        translations: {
            it: { title: "Titolo privato", summary: "Sintesi privata", bodyMd: "# IT" },
            en: { title: "Private title", summary: "Private summary", bodyMd: "# EN" }
        }
    }, null, 2)}\n`);

    const session = createAdminSession({ token: "example-local-session-token" });
    const config = createAdminConfig({ host: "127.0.0.1", port: 8787, contentRoot, auditRoot, publicAssetRoot, publishedManifestPath: path.resolve("data/published.json"), session });
    const blocked = await buildAdminResponse({ method: "PUT", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: { host: "127.0.0.1:8787" }, config });
    const saved = await buildAdminResponse({ method: "PUT", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: { host: "127.0.0.1:8787", origin: "http://127.0.0.1:8787", "content-type": "application/json", [ADMIN_SESSION_HEADER]: session.token }, body: JSON.stringify({ documentId: "resume-main", fields: { "translations.en.title": "Updated private title" } }), config });
    const preview = await buildAdminResponse({ method: "POST", url: "/api/admin/documents/resume-main/preview", remoteAddress: "127.0.0.1", headers: { host: "127.0.0.1:8787", origin: "http://127.0.0.1:8787", "content-type": "application/json", [ADMIN_SESSION_HEADER]: session.token }, config });

    console.log(JSON.stringify({
        blocked: { status: blocked.statusCode, action: JSON.parse(blocked.body).action, message: JSON.parse(blocked.body).message },
        saved: { status: saved.statusCode, action: JSON.parse(saved.body).action, title: JSON.parse(saved.body).document.translations.en.title },
        preview: { status: preview.statusCode, action: JSON.parse(preview.body).action, message: JSON.parse(preview.body).message }
    }, null, 2));

    assert.equal(blocked.statusCode, 403);
    assert.equal(saved.statusCode, 200);
    assert.equal(JSON.parse(saved.body).document.translations.en.title, "Updated private title");
    assert.equal(preview.statusCode, 423);
} finally {
    await fs.rm(root, { recursive: true, force: true });
}
