import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    createAdminConfig,
    buildAdminResponse,
    startAdminServer
} from "../admin/server.js";
import { ADMIN_LOCKED_ACTIONS } from "../admin/health.js";
import { ADMIN_SESSION_HEADER } from "../admin/session.js";
import { evaluateEditorialSummary } from "../admin/content-store.js";

const COUNT_KEYS = ["draft", "ready", "published", "blocked"];
const AREA_KEYS = ["resume", "blog", "resources"];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-007-admin-"));
    try {
        return await fn(root);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

async function writeJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function completeTranslations() {
    return {
        it: { title: "Titolo", summary: "Sintesi" },
        en: { title: "Title", summary: "Summary" }
    };
}

function missingEnglishTranslations() {
    return {
        it: { title: "Solo italiano" }
    };
}

function getArea(summary, key) {
    return summary.areas.find((area) => area.key === key);
}

function validReadHeaders(session) {
    return {
        [ADMIN_SESSION_HEADER]: session.token
    };
}

async function seedDocuments(contentRoot) {
    const docsRoot = path.join(contentRoot, "documents");
    await fs.mkdir(docsRoot, { recursive: true });

    await writeJson(path.join(docsRoot, "resume-main.json"), {
        id: "resume-main",
        type: "resume",
        status: "published",
        translations: completeTranslations()
    });

    await writeJson(path.join(docsRoot, "blog-ready.json"), {
        id: "blog-ready",
        type: "blog",
        status: "draft",
        translations: completeTranslations(),
        href: "#/blog/blog-ready"
    });

    await writeJson(path.join(docsRoot, "blog-missing-en.json"), {
        id: "blog-missing-en",
        type: "blogPost",
        status: "draft",
        translations: missingEnglishTranslations()
    });

    await writeJson(path.join(docsRoot, "resource-unsafe.json"), {
        id: "resource-unsafe",
        type: "resource",
        status: "draft",
        translations: completeTranslations(),
        externalUrl: "java\nscript:alert(1)"
    });

    await writeJson(path.join(docsRoot, "resource-archived.json"), {
        id: "resource-archived",
        type: "resource",
        status: "archived",
        translations: completeTranslations()
    });

    await writeJson(path.join(docsRoot, "unknown-type.json"), {
        id: "unknown-type",
        type: "caseStudy",
        status: "draft",
        translations: completeTranslations()
    });

    await fs.writeFile(path.join(docsRoot, "malformed.json"), "{ nope");
    await writeJson(path.join(docsRoot, "array.json"), ["not", "an", "object"]);
}

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(contentRoot);
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    await seedDocuments(contentRoot);

    const config = createAdminConfig({
        host: "127.0.0.1",
        port: 0,
        contentRoot,
        auditRoot,
        publicAssetRoot,
        publishedManifestPath: path.resolve("data/published.json")
    });
    const running = await startAdminServer(config);
    const baseUrl = `http://${running.host}:${running.port}`;

    try {
        const adminResponse = await fetch(`${baseUrl}/admin`);
        const adminHtml = await adminResponse.text();
        assert.equal(adminResponse.status, 200, "GET /admin succeeds through loopback");
        assert.match(adminHtml, /data-shell-nav="sections"/i, "connected /admin reuses the shared shell nav");
        assert.match(adminHtml, /data-admin-overlay-shell/i, "connected /admin renders overlay strip marker");
        assert.match(adminHtml, /data-overlay-state="connected"/i, "connected /admin starts in connected overlay state");
        assert.doesNotMatch(adminHtml, /data-admin-bootstrap="dashboard"|data-editorial-area|data-count=|editorial-count|editorial-diagnostics/i, "connected /admin initial HTML does not render dashboard cards, editorial counts, or diagnostics lists");
        assert.doesNotMatch(adminHtml, /<button[^>]*>\s*(?:Save|Preview|Publish|Unpublish|Upload)\b/i, "no mutation buttons render");
        assert.doesNotMatch(adminHtml, /data-action="(?:save|preview|publish|unpublish|upload)"/i, "no mutation action controls render");
        assert.doesNotMatch(adminHtml, /Solo italiano|java\s*script|alert\(1\)|resume-main\.json/i, "connected /admin initial HTML does not expose seeded unsafe values or raw document filenames");

        const apiResponse = await fetch(`${baseUrl}/api/admin/editorial-summary`, {
            headers: validReadHeaders(running.config.session)
        });
        const apiJson = await apiResponse.json();
        assert.equal(apiResponse.status, 200, "GET /api/admin/editorial-summary succeeds with the private read header");
        assert.equal(apiJson.writeEnabled, false, "editorial summary keeps writeEnabled=false");
        assert.deepEqual(apiJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "editorial summary keeps SBR-006 locked actions");
        assert.equal(apiJson.editorial.status, "connected", "editorial API status is connected");
        assert.deepEqual(getArea(apiJson.editorial, "resume").counts, { draft: 0, ready: 0, published: 1, blocked: 0 }, "resume API counts remain correct");
        assert.deepEqual(getArea(apiJson.editorial, "blog").counts, { draft: 2, ready: 1, published: 0, blocked: 1 }, "blog API counts remain correct");
        assert.deepEqual(getArea(apiJson.editorial, "resources").counts, { draft: 1, ready: 0, published: 0, blocked: 1 }, "resources API counts remain correct");
        assert.match(JSON.stringify(apiJson), /missing en translation/i, "API names missing language reason");
        assert.match(JSON.stringify(apiJson), /unsafe reference/i, "API names unsafe reference reason");
        assert.doesNotMatch(JSON.stringify(apiJson), /Titolo|Title|Summary|java\s*script|alert\(1\)|resume-main\.json/i, "API does not expose body copy, unsafe values, or raw filenames");

        const blockedReadResponse = await fetch(`${baseUrl}/api/admin/editorial-summary`);
        const blockedReadJson = await blockedReadResponse.json();
        assert.equal(blockedReadResponse.status, 403, "GET /api/admin/editorial-summary without the private read header is blocked");
        assert.equal(blockedReadJson.writeEnabled, false, "blocked editorial summary keeps writeEnabled=false");
        assert.doesNotMatch(JSON.stringify(blockedReadJson), /"editorial"\s*:\s*\{|"areas"\s*:\s*\[/i, "blocked editorial summary exposes no editorial payload");

        const before = await fs.readdir(path.join(contentRoot, "documents"));
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            const writeAttempt = await fetch(`${baseUrl}/api/admin/editorial-summary`, { method, body: "blocked" });
            assert.ok(!writeAttempt.ok, `${method} editorial-summary is non-2xx`);
            const payload = await writeAttempt.json();
            assert.equal(payload.writeEnabled, false, `${method} keeps writeEnabled=false`);
        }
        assert.deepEqual(await fs.readdir(path.join(contentRoot, "documents")), before, "mutation attempts do not change private documents");
    } finally {
        await running.close();
    }
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    await fs.mkdir(contentRoot);
    const summary = await evaluateEditorialSummary(createAdminConfig({
        contentRoot,
        auditRoot: path.join(tempRoot, "audit"),
        publicAssetRoot: path.join(tempRoot, "public-assets")
    }));

    assert.equal(summary.status, "degraded", "missing documents directory is degraded");
    assert.match(summary.detail, /missing|future setup/i, "degraded summary has human-readable reason");
    for (const area of summary.areas) {
        assert.deepEqual(area.counts, { draft: 0, ready: 0, published: 0, blocked: 0 }, `${area.key} degraded counts are zero`);
    }
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "blocked-content");
    await fs.mkdir(contentRoot);
    await fs.chmod(contentRoot, 0o000);
    try {
        const summary = await evaluateEditorialSummary(createAdminConfig({
            contentRoot,
            auditRoot: path.join(tempRoot, "audit"),
            publicAssetRoot: path.join(tempRoot, "public-assets")
        }));
        assert.equal(summary.status, "blocked", "unreadable content root is blocked");
        assert.match(summary.detail, /not readable|blocked|cannot/i, "blocked summary has store failure reason");
        assert.deepEqual(summary.diagnostics, [], "blocked store exposes no document diagnostics");
    } finally {
        await fs.chmod(contentRoot, 0o700);
    }
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), {
        id: "secret-resume-id",
        type: "resume",
        status: "published",
        translations: completeTranslations()
    });
    const config = createAdminConfig({ contentRoot, publishedManifestPath: path.resolve("data/published.json") });

    const blockedAdmin = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "203.0.113.7",
        config
    });
    assert.equal(blockedAdmin.statusCode, 403, "non-loopback /admin is blocked");
    assert.doesNotMatch(blockedAdmin.body, /data-editorial-area|data-count|secret-resume-id|published|blocked reason/i, "non-loopback /admin exposes no editorial data");

    const blockedApi = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/editorial-summary",
        remoteAddress: "203.0.113.7",
        config
    });
    assert.equal(blockedApi.statusCode, 403, "non-loopback editorial API is blocked");
    assert.doesNotMatch(blockedApi.body, /areas|counts|secret-resume-id|published|documents/i, "non-loopback editorial API exposes no editorial data");
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), {
        id: "session-blocked-resume-id",
        type: "resume",
        status: "published",
        translations: completeTranslations()
    });
    const config = createAdminConfig({
        contentRoot,
        publishedManifestPath: path.resolve("data/published.json"),
        session: {
            id: "missing",
            token: "",
            headerName: "x-sbar-admin-session",
            createdAt: null
        }
    });

    const blockedAdmin = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "127.0.0.1",
        config
    });
    assert.equal(blockedAdmin.statusCode, 403, "blocked local session returns protected blocked dashboard");
    assert.doesNotMatch(blockedAdmin.body, /data-editorial-area|data-count|session-blocked-resume-id|published|documents/i, "blocked local session /admin exposes no editorial data");

    const blockedApi = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/editorial-summary",
        remoteAddress: "127.0.0.1",
        config
    });
    assert.equal(blockedApi.statusCode, 403, "blocked local session returns protected blocked editorial API");
    assert.doesNotMatch(blockedApi.body, /areas|counts|session-blocked-resume-id|published|documents/i, "blocked local session editorial API exposes no editorial data");
});

{
    const publicFiles = [
        "index.html",
        "script.js",
        "app/bootline.js",
        "app/content-loader.js",
        "app/controls.js",
        "app/intro.js",
        "app/patch-engine.js",
        "app/render.js",
        "app/shared.js"
    ];
    for (const publicFile of publicFiles) {
        const source = await fs.readFile(publicFile, "utf8");
        assert.doesNotMatch(source, /editorial-summary|data-editorial-area|api\/admin|admin\/server/i, `${publicFile} does not import or render admin editorial overview`);
    }
}

{
    const packageFiles = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "deno.json", "bun.lockb"];
    for (const packageFile of packageFiles) {
        await assert.rejects(() => fs.access(packageFile), /ENOENT/, `${packageFile} is not introduced by SBR-007`);
    }
}

console.log("SBR-007 editorial dashboard readiness overview assertions passed");
