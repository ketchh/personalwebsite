import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAdminResponse, createAdminConfig } from "../admin/server.js";
import { ADMIN_LOCKED_ACTIONS } from "../admin/health.js";
import { ADMIN_SESSION_HEADER } from "../admin/session.js";

const PACKAGE_FILES = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "deno.json", "bun.lockb"];
const PUBLIC_FILES = [
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
const PRIVATE_SENTINELS = [
    "SBR011 Private Resume Title",
    "SBR011 private summary",
    "SBR011_PRIVATE_MD",
    "SBR011_PRIVATE_EMAIL@example.invalid"
];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-011-admin-"));
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

function validReadHeaders(config) {
    return {
        host: `127.0.0.1:${config.port}`,
        [ADMIN_SESSION_HEADER]: config.session.token
    };
}

function assertNoPrivateLeak(value, label = "payload") {
    for (const sentinel of PRIVATE_SENTINELS) {
        assert.doesNotMatch(value, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${label} does not leak ${sentinel}`);
    }
}

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot, { recursive: true });
    await fs.mkdir(publicAssetRoot, { recursive: true });

    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), {
        id: "resume-main",
        type: "resume",
        status: "draft",
        translations: {
            it: {
                title: "SBR011 Private Resume Title IT",
                summary: "SBR011 private summary IT",
                bodyMd: "# SBR011_PRIVATE_MD_IT",
                contacts: [{ label: "email", href: "mailto:SBR011_PRIVATE_EMAIL@example.invalid" }]
            },
            en: {
                title: "SBR011 Private Resume Title EN",
                summary: "SBR011 private summary EN",
                bodyMd: "# SBR011_PRIVATE_MD_EN"
            }
        }
    });
    await writeJson(path.join(contentRoot, "documents", "blog-draft.json"), {
        id: "blog-draft",
        type: "blog",
        status: "draft",
        translations: {
            it: { title: "Blog bozza" },
            en: { title: "Draft blog" }
        }
    });

    const config = createAdminConfig({
        host: "127.0.0.1",
        port: 8787,
        contentRoot,
        auditRoot,
        publicAssetRoot,
        publishedManifestPath: path.resolve("data/published.json")
    });

    const adminResponse = await buildAdminResponse({ method: "GET", url: "/admin", remoteAddress: "127.0.0.1", headers: { host: "127.0.0.1:8787" }, config });
    assert.equal(adminResponse.statusCode, 200, "GET /admin succeeds through loopback");
    assert.match(adminResponse.body, /data-shell-nav="sections"/i, "private /admin reuses the shared shell nav");
    assert.match(adminResponse.body, /data-admin-overlay-shell/i, "private /admin renders overlay utility strip marker");
    assert.match(adminResponse.body, /admin mode \/ connected/i, "private /admin names connected admin mode");
    assert.match(adminResponse.body, /write enabled/i, "private /admin names connected write state");
    assert.match(adminResponse.body, /Diagnostics/i, "private /admin keeps the diagnostics entry visible");
    assert.doesNotMatch(adminResponse.body, /data-admin-bootstrap="dashboard"|class="admin-hero|data-guardrail=|data-editorial-area|data-count=/i, "private /admin does not primary-render the legacy dashboard cards or server-render editorial counts");
    assert.doesNotMatch(adminResponse.body, /<button[^>]*>\s*(?:Save|Preview|Publish|Unpublish|Upload)\b|data-action="(?:save|preview|publish|unpublish|upload)"/i, "private /admin renders no enabled mutation controls");
    assertNoPrivateLeak(adminResponse.body, "/admin HTML");

    const healthResponse = await buildAdminResponse({ method: "GET", url: "/api/admin/health", remoteAddress: "127.0.0.1", config });
    const healthJson = JSON.parse(healthResponse.body);
    assert.equal(healthResponse.statusCode, 200, "health API remains available");
    assert.equal(healthJson.writeEnabled, true, "health API still reports writeEnabled=true when guardrails are connected");
    assert.deepEqual(healthJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "health API keeps locked actions contract");
    assert.ok(Array.isArray(healthJson.guardrails), "health API still exposes guardrails array");

    const editorialResponse = await buildAdminResponse({ method: "GET", url: "/api/admin/editorial-summary", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config });
    const editorialJson = JSON.parse(editorialResponse.body);
    assert.equal(editorialResponse.statusCode, 200, "editorial API remains available with the private read header");
    assert.equal(editorialJson.writeEnabled, false, "editorial API keeps writeEnabled=false");
    assert.ok(Array.isArray(editorialJson.editorial.areas), "editorial API still exposes areas for authenticated reads");

    const blockedResponse = await buildAdminResponse({ method: "GET", url: "/admin", remoteAddress: "203.0.113.10", config });
    assert.equal(blockedResponse.statusCode, 403, "non-loopback /admin remains blocked");
    assert.match(blockedResponse.body, /data-admin-overlay-shell/i, "blocked /admin still renders overlay marker");
    assert.match(blockedResponse.body, /data-overlay-state="blocked"/i, "blocked /admin keeps blocked overlay state");
    assert.doesNotMatch(blockedResponse.body, /data-editorial-area|data-count=|data-admin-bootstrap="dashboard"/i, "blocked /admin exposes no editorial counts or legacy dashboard cards");
    assertNoPrivateLeak(blockedResponse.body, "blocked /admin HTML");
});

{
    const overlayCss = await fs.readFile("admin/public/overlay.css", "utf8");
    assert.match(overlayCss, /min-height:\s*var\(--touch-target-min\)/, "overlay controls use touch-target-min");
    assert.match(overlayCss, /border-radius:\s*var\(--radius-control\)/, "overlay surfaces use squared radius tokens");
    assert.match(overlayCss, /var\(--secondary-500\)/, "overlay uses secondary-500 for system cues");
    assert.match(overlayCss, /var\(--warning-500\)/, "overlay uses warning-500 for draft\/unavailable state");
    assert.match(overlayCss, /var\(--danger-500\)/, "overlay uses danger-500 for blocked state");
    assert.match(overlayCss, /font-family:\s*var\(--font-mono\)/, "overlay labels use the mono font");
    assert.match(overlayCss, /font-family:\s*var\(--font-body\)/, "overlay copy uses the body font");
    assert.doesNotMatch(overlayCss, /var\(--section-(?:resume|blog|resources)-500\)/, "overlay semantics do not reuse public section identity colors");
}

for (const publicFile of PUBLIC_FILES) {
    const source = await fs.readFile(publicFile, "utf8");
    assert.doesNotMatch(source, /data-admin-overlay-shell|\/admin\/overlay\.(?:js|css)|api\/admin\/(?:health|editorial-summary|documents\/resume-main)/i, `${publicFile} stays separated from the private overlay runtime`);
}

for (const packageFile of PACKAGE_FILES) {
    await assert.rejects(() => fs.access(packageFile), /ENOENT/, `${packageFile} was not introduced`);
}

console.log("SBR-011 admin dashboard visual parity assertions passed");
