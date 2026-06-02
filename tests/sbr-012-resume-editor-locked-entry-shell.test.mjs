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
const LOCKED_ACTIONS = ["preview", "publish", "unpublish", "upload"];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-012-admin-"));
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

async function listRelative(root) {
    try {
        return (await fs.readdir(root, { recursive: true })).sort();
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

function validReadHeaders(session, port = 0) {
    return {
        host: `127.0.0.1:${port}`,
        [ADMIN_SESSION_HEADER]: session.token
    };
}

function assertNoPrivateResumeValues(value) {
    assert.doesNotMatch(
        value,
        /SBR012_PRIVATE_RESUME_ID|SBR012 Private Resume Title|SBR012 private summary|SBR012_PRIVATE_EMAIL|SBR012_PRIVATE_MD|resume-main\.json/i,
        "response does not expose private Resume document values or diagnostics"
    );
}

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), {
        id: "SBR012_PRIVATE_RESUME_ID",
        type: "resume",
        status: "draft",
        translations: {
            it: {
                title: "SBR012 Private Resume Title IT",
                summary: "SBR012 private summary IT",
                bodyMd: "# SBR012_PRIVATE_MD_IT",
                contacts: [{ label: "email", href: "mailto:SBR012_PRIVATE_EMAIL@example.invalid" }]
            },
            en: {
                title: "SBR012 Private Resume Title EN",
                summary: "SBR012 private summary EN",
                bodyMd: "# SBR012_PRIVATE_MD_EN"
            }
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
    assert.equal(adminResponse.statusCode, 200, "connected /admin succeeds");
    assert.match(adminResponse.body, /data-shell-nav="sections"/i, "connected /admin reuses the shared shell nav");
    assert.match(adminResponse.body, /data-admin-overlay-shell/i, "connected /admin renders overlay utility strip");
    assert.match(adminResponse.body, /data-overlay-state="connected"/i, "connected /admin starts in connected overlay state");
    assert.doesNotMatch(adminResponse.body, /data-admin-bootstrap="dashboard"|data-editorial-area|data-count=|data-editor-entry="resume"/i, "connected /admin initial HTML exposes no dashboard cards, editorial areas, or editor entry data");
    assertNoPrivateResumeValues(adminResponse.body);

    const blockedAdmin = await buildAdminResponse({ method: "GET", url: "/admin", remoteAddress: "203.0.113.12", config });
    assert.equal(blockedAdmin.statusCode, 403, "non-loopback /admin stays blocked");
    assert.doesNotMatch(blockedAdmin.body, /\/admin\/resume|data-editor-entry="resume"|data-editorial-area|data-count|content root|published manifest/i, "blocked /admin renders no editor entry, editorial counts, or diagnostics");
    assertNoPrivateResumeValues(blockedAdmin.body);

    const blockedSessionConfig = createAdminConfig({
        host: "127.0.0.1",
        port: 0,
        contentRoot,
        auditRoot,
        publicAssetRoot,
        publishedManifestPath: path.resolve("data/published.json"),
        session: { id: "missing", token: "", headerName: "x-sbar-admin-session", createdAt: null }
    });
    const blockedSessionAdmin = await buildAdminResponse({ method: "GET", url: "/admin", remoteAddress: "127.0.0.1", config: blockedSessionConfig });
    assert.equal(blockedSessionAdmin.statusCode, 403, "blocked local session /admin stays protected");
    assert.doesNotMatch(blockedSessionAdmin.body, /\/admin\/resume|data-editor-entry="resume"|data-editorial-area|data-count|content root|published manifest/i, "blocked local session /admin renders no editor entry, editorial counts, or diagnostics");
    assertNoPrivateResumeValues(blockedSessionAdmin.body);

    const editorResponse = await buildAdminResponse({ method: "GET", url: "/admin/resume", remoteAddress: "127.0.0.1", headers: { host: "127.0.0.1:8787" }, config });
    assert.equal(editorResponse.statusCode, 200, "connected /admin/resume succeeds");
    assert.match(editorResponse.body, /data-admin-editor="resume"/, "Resume editor shell has deterministic root marker");
    assert.match(editorResponse.body, /data-admin-bootstrap="resume"/, "Resume editor shell renders protected bootstrap marker");
    assert.match(editorResponse.body, /data-bootstrap-state="loading"/, "Resume editor shell starts in bootstrap loading state");
    assert.match(editorResponse.body, /href="\/admin\/admin\.css"/, "Resume editor shell links refreshed admin CSS");
    assert.match(editorResponse.body, /href="\/admin"/, "Resume editor shell links back to dashboard");
    assert.doesNotMatch(editorResponse.body, /data-field-path=|data-editor-language=|data-resume-form=|data-action="save"|data-resume-readiness=|data-readiness-check=/i, "Resume editor initial HTML exposes no draft-bearing controls or readiness details");
    assertNoPrivateResumeValues(editorResponse.body);

    for (const action of LOCKED_ACTIONS) {
        assert.match(editorResponse.body, new RegExp(`data-locked-action="${action}"`, "i"), `${action} locked action marker is present`);
        assert.match(editorResponse.body, new RegExp(`${action}[\\s\\S]{0,120}(?:locked|unavailable|future|guarded)|(?:locked|unavailable|future|guarded)[\\s\\S]{0,120}${action}`, "i"), `${action} locked action explanation is present`);
    }
    assert.doesNotMatch(editorResponse.body, /data-action="(?:save|preview|publish|unpublish|upload)"/i, "no enabled mutation action markers render in the initial shell");
    assert.match(editorResponse.body, /protected bootstrap|loading protected Resume state/i, "Resume editor shell explains the protected bootstrap state");

    const blockedEditor = await buildAdminResponse({ method: "GET", url: "/admin/resume", remoteAddress: "203.0.113.12", config });
    assert.equal(blockedEditor.statusCode, 403, "non-loopback /admin/resume is blocked");
    assert.match(blockedEditor.body, /ssh\s+-L\s+8787:127\.0\.0\.1:8787/i, "blocked /admin/resume gives SSH recovery hint");
    assert.doesNotMatch(blockedEditor.body, /data-admin-editor|data-editor-language|data-locked-action|data-editorial-area|data-count/i, "blocked /admin/resume exposes no editor shell, locked action list, or counts");
    assertNoPrivateResumeValues(blockedEditor.body);

    const blockedSessionEditor = await buildAdminResponse({ method: "GET", url: "/admin/resume", remoteAddress: "127.0.0.1", config: blockedSessionConfig });
    assert.equal(blockedSessionEditor.statusCode, 403, "blocked local session /admin/resume is blocked");
    assert.doesNotMatch(blockedSessionEditor.body, /data-admin-editor|data-editor-language|data-locked-action|data-editorial-area|data-count/i, "blocked local session /admin/resume exposes no editor shell, locked action list, or counts");
    assertNoPrivateResumeValues(blockedSessionEditor.body);

    const blockedDocumentApi = await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: { host: "127.0.0.1:8787" }, config });
    assert.equal(blockedDocumentApi.statusCode, 403, "Resume document API is blocked without the private read header");
    const blockedDocumentPayload = JSON.parse(blockedDocumentApi.body);
    assert.equal(blockedDocumentPayload.writeEnabled, false, "blocked Resume document API keeps writeEnabled=false");
    assertNoPrivateResumeValues(blockedDocumentApi.body);

    const documentApi = await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config.session, 8787), config });
    const documentPayload = JSON.parse(documentApi.body);
    assert.ok(documentApi.statusCode >= 400, "Resume document API can still block invalid singleton data even with the private read header");
    assert.equal(documentPayload.writeEnabled, false, "authenticated blocked Resume document API keeps writeEnabled=false");
    assertNoPrivateResumeValues(documentApi.body);

    const health = await buildAdminResponse({ method: "GET", url: "/api/admin/health", remoteAddress: "127.0.0.1", config });
    const healthJson = JSON.parse(health.body);
    assert.equal(health.statusCode, 200, "health API remains available");
    assert.equal(healthJson.writeEnabled, true, "health API reports writeEnabled=true for guarded draft save");
    assert.deepEqual(healthJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "health API locked actions are unchanged");
    assert.ok(Array.isArray(healthJson.guardrails), "health API guardrail contract remains present");

    const blockedEditorial = await buildAdminResponse({ method: "GET", url: "/api/admin/editorial-summary", remoteAddress: "127.0.0.1", headers: { host: "127.0.0.1:8787" }, config });
    assert.equal(blockedEditorial.statusCode, 403, "editorial summary API is blocked without the private read header");

    const editorial = await buildAdminResponse({ method: "GET", url: "/api/admin/editorial-summary", remoteAddress: "127.0.0.1", headers: validReadHeaders(config.session, 8787), config });
    const editorialJson = JSON.parse(editorial.body);
    assert.equal(editorial.statusCode, 200, "editorial summary API remains available with the private read header");
    assert.equal(editorialJson.writeEnabled, false, "editorial summary keeps writeEnabled=false");
    assert.deepEqual(editorialJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "editorial API locked actions are unchanged");
    assert.ok(Array.isArray(editorialJson.editorial.areas), "editorial API areas remain present");

    const beforeContent = await listRelative(contentRoot);
    const beforeAudit = await listRelative(auditRoot);
    const beforePublicAssets = await listRelative(publicAssetRoot);
    const manifestBefore = await fs.readFile(path.resolve("data/published.json"), "utf8");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        for (const target of [
            "/admin/resume",
            "/api/admin/documents/resume-main",
            "/api/admin/documents/resume-main/preview",
            "/api/admin/documents/resume-main/publish",
            "/api/admin/documents/resume-main/unpublish"
        ]) {
            const attempt = await buildAdminResponse({ method, url: target, remoteAddress: "127.0.0.1", config });
            assert.ok(attempt.statusCode >= 400, `${method} ${target} stays non-2xx`);
            const payload = JSON.parse(attempt.body);
            assert.equal(payload.writeEnabled, false, `${method} ${target} keeps writeEnabled=false`);
        }
    }
    assert.deepEqual(await listRelative(contentRoot), beforeContent, "mutation attempts do not change content root");
    assert.deepEqual(await listRelative(auditRoot), beforeAudit, "mutation attempts do not change audit root");
    assert.deepEqual(await listRelative(publicAssetRoot), beforePublicAssets, "mutation attempts do not change public asset root");
    assert.equal(await fs.readFile(path.resolve("data/published.json"), "utf8"), manifestBefore, "mutation attempts do not rewrite published manifest");
});

{
    const adminCss = await fs.readFile("admin/public/admin.css", "utf8");
    assert.match(adminCss, /\.editor-entry[\s\S]*min-height:\s*var\(--touch-target-min\)/, "dashboard editor entry uses touch-target-min");
    assert.match(adminCss, /\.editor-entry[\s\S]*:focus-visible/, "dashboard editor entry has focus-visible styling");
    assert.match(adminCss, /\.resume-editor-shell[\s\S]*border-radius:\s*var\(--radius-card\)/, "Resume editor shell uses squared radius token");
    assert.match(adminCss, /\.editor-language-panel[\s\S]*border-radius:\s*var\(--radius-card\)/, "language panels use squared radius token");
    assert.match(adminCss, /\.locked-action[\s\S]*var\(--warning-500\)/, "locked editor actions use warning-500 semantics");
    assert.doesNotMatch(adminCss, /\.locked-action[\s\S]{0,260}var\(--section-(?:resume|blog|resources)-500\)/, "locked editor actions do not use public section identity colors");
    assert.match(adminCss, /\.editor-language-panel[\s\S]*font-family:\s*var\(--font-body\)/, "editor panels use readable body font");
    assert.match(adminCss, /\.locked-action[\s\S]*font-family:\s*var\(--font-mono\)/, "locked action metadata uses mono font");
    assert.match(adminCss, /\.admin-link[\s\S]*min-height:\s*var\(--touch-target-min\)/, "back/dashboard links use touch-target-min");
}

for (const publicFile of PUBLIC_FILES) {
    const source = await fs.readFile(publicFile, "utf8");
    assert.doesNotMatch(source, /\/admin\/resume|data-admin-editor|data-editor-entry|api\/admin\/documents\/resume-main/i, `${publicFile} stays separated from Resume admin editor runtime`);
}
const indexHtml = await fs.readFile("index.html", "utf8");
assert.match(indexHtml, /#\/resume/, "public Resume route remains present");
assert.match(indexHtml, /#\/blog/, "public Blog route remains present");
assert.match(indexHtml, /#\/resources/, "public Resources route remains present");

for (const packageFile of PACKAGE_FILES) {
    await assert.rejects(() => fs.access(packageFile), /ENOENT/, `${packageFile} was not introduced`);
}

console.log("SBR-012 resume editor locked entry shell assertions passed");
