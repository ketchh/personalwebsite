import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAdminResponse, createAdminConfig, startAdminServer } from "../admin/server.js";
import { ADMIN_LOCKED_ACTIONS } from "../admin/health.js";
import { ADMIN_SESSION_HEADER, createAdminSession } from "../admin/session.js";

const PACKAGE_FILES = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "deno.json", "bun.lockb", "requirements.txt", "pyproject.toml"];
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
const SAVE_ROUTE = { method: "PUT", url: "/api/admin/documents/resume-main", action: "save" };
const LOCKED_MUTATION_ROUTES = [
    { method: "POST", url: "/api/admin/documents/resume-main/preview", action: "preview" },
    { method: "POST", url: "/api/admin/documents/resume-main/publish", action: "publish" },
    { method: "POST", url: "/api/admin/documents/resume-main/unpublish", action: "unpublish" },
    { method: "POST", url: "/api/admin/uploads", action: "upload" }
];
const MUTATION_ROUTES = [SAVE_ROUTE, ...LOCKED_MUTATION_ROUTES];
const PRIVATE_SENTINELS = [
    "SBR015_PRIVATE_BODY_SENTINEL",
    "SBR015_PRIVATE_RESUME_VALUE",
    "SBR015_MARKDOWN_SENTINEL",
    "javascript:alert('SBR015')",
    "../drafts/SBR015-private.md",
    "/var/lib/sbar-si/SBR015-private"
];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-015-admin-"));
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

function completeResume(overrides = {}) {
    return {
        id: "resume-main",
        type: "resume",
        status: "draft",
        slug: "resume-main",
        translations: {
            it: {
                title: "SBR015 Titolo privato",
                summary: "SBR015 sintesi privata",
                bodyMd: "# SBR015 corpo privato",
                hero: {
                    headline: "Sistemi complessi, codice leggero",
                    actions: [{ label: "Email", href: "mailto:alessandro.sbarsi@gmail.com" }]
                },
                facts: [{ label: "Focus", value: "performance" }]
            },
            en: {
                title: "SBR015 Private Title",
                summary: "SBR015 private summary",
                bodyMd: "# SBR015 private body",
                hero: {
                    headline: "Complex systems, lightweight code",
                    actions: [{ label: "Email", href: "mailto:alessandro.sbarsi@gmail.com" }]
                },
                facts: [{ label: "Focus", value: "performance" }]
            }
        },
        ...overrides
    };
}

async function createFixture(tempRoot, options = {}) {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot, { recursive: true });
    await fs.mkdir(publicAssetRoot, { recursive: true });
    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume(options.resume || {}));
    const session = options.session || createAdminSession({ now: () => new Date("2026-05-29T15:00:00.000Z") });
    const config = createAdminConfig({
        host: "127.0.0.1",
        port: options.port ?? 8787,
        contentRoot,
        auditRoot,
        publicAssetRoot,
        publishedManifestPath: path.resolve("data/published.json"),
        session
    });

    return { contentRoot, auditRoot, publicAssetRoot, session, config };
}

function validHeaders(session, port = 8787, overrides = {}) {
    return {
        host: `127.0.0.1:${port}`,
        origin: `http://127.0.0.1:${port}`,
        "content-type": "application/json; charset=utf-8",
        [ADMIN_SESSION_HEADER]: session.token,
        ...overrides
    };
}

async function preflight(route, fixture, options = {}) {
    return buildAdminResponse({
        method: options.method || route.method,
        url: options.url || route.url,
        remoteAddress: options.remoteAddress || "127.0.0.1",
        headers: options.headers,
        body: options.body,
        config: fixture.config
    });
}

function parseJsonResponse(response, label = "response") {
    assert.match(response.headers["content-type"], /application\/json/i, `${label} is JSON`);
    return JSON.parse(response.body);
}

function assertNoPermissiveCors(headers, label = "response") {
    const serialized = JSON.stringify(headers).toLowerCase();
    assert.doesNotMatch(serialized, /access-control-allow-origin"\s*:\s*"\*/i, `${label} does not allow wildcard CORS`);
    assert.doesNotMatch(serialized, /access-control-allow-credentials"\s*:\s*"true/i, `${label} does not allow credentialed CORS`);
}

function assertPreflightEnvelope(payload, action) {
    assert.equal(payload.service, "sbar.si admin", `${action} reports service`);
    assert.equal(payload.safeMode, true, `${action} reports safeMode=true`);
    assert.equal(payload.writeEnabled, false, `${action} keeps writeEnabled=false`);
    assert.equal(payload.action, action, `${action} action mapping is deterministic`);
    assert.ok(payload.preflight && typeof payload.preflight === "object", `${action} includes preflight object`);
    assert.deepEqual(payload.actionsLocked, ADMIN_LOCKED_ACTIONS, `${action} reports locked actions`);
    assert.equal(typeof payload.message, "string", `${action} has human-readable message`);
}

function assertNoPrivateLeak(value, label = "payload") {
    for (const sentinel of PRIVATE_SENTINELS) {
        assert.doesNotMatch(value, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${label} does not leak ${sentinel}`);
    }
    assert.doesNotMatch(value, /SBR015_SECRET_TOKEN|SBR015_INVALID_TOKEN_SHOULD_NOT_ECHO/i, `${label} does not leak submitted token values`);
    assert.doesNotMatch(value, /<script|rendered markdown|preview html|data-resume-readiness|renderableFieldParity|SBR015_PRIVATE_RESUME_VALUE/i, `${label} does not expose private previews/readiness`);
    assert.doesNotMatch(value, /\/tmp\/sbr-015-admin-|content\/documents|public-assets|data\/published\.json/i, `${label} does not expose filesystem paths`);
}

function assertNoEnabledMutationControls(value, { allowSave = false } = {}) {
    const enabledActionPattern = allowSave
        ? /data-action="(?:preview|publish|unpublish|upload)"/i
        : /data-action="(?:save|preview|publish|unpublish|upload)"/i;
    const enabledButtonPattern = allowSave
        ? /<button[^>]*>\s*(?:Preview|Publish|Unpublish|Upload)\b/i
        : /<button[^>]*>\s*(?:Save draft|Save|Preview|Publish|Unpublish|Upload)\b/i;
    const formPattern = allowSave
        ? /<form[^>]*(?:preview|publish|unpublish|upload)/i
        : /<form[^>]*(?:save|preview|publish|unpublish|upload)/i;

    assert.doesNotMatch(value, enabledActionPattern, "no unexpected enabled mutation data-action markers render");
    assert.doesNotMatch(value, enabledButtonPattern, "no unexpected enabled mutation buttons render");
    assert.doesNotMatch(value, formPattern, "no unexpected mutation form is rendered");
}

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);

    for (const route of MUTATION_ROUTES) {
        const response = await preflight(route, fixture, { headers: { host: "127.0.0.1:8787" } });
        assert.equal(response.statusCode, 403, `${route.action} missing guards returns 403`);
        assertNoPermissiveCors(response.headers, `${route.action} guard failure`);
        const payload = parseJsonResponse(response, `${route.action} guard failure`);
        assertPreflightEnvelope(payload, route.action);
        assert.equal(payload.preflight.allowed, false, `${route.action} guard failure is not allowed`);
        assert.match(payload.message, /Request blocked before content changed/i, `${route.action} explains blocked-before-change`);
        assert.ok(payload.preflight.reasons.some((item) => item.code === "origin-missing"), `${route.action} reports origin-missing`);
        assert.ok(payload.preflight.reasons.some((item) => item.code === "session-token-missing"), `${route.action} reports missing session token`);
        assert.ok(payload.preflight.reasons.some((item) => item.code === "invalid-content-type"), `${route.action} reports invalid content type`);
        assertNoPrivateLeak(response.body, `${route.action} guard failure response`);
    }
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);

    for (const route of LOCKED_MUTATION_ROUTES) {
        const response = await preflight(route, fixture, { headers: validHeaders(fixture.session) });
        assert.equal(response.statusCode, 423, `${route.action} valid preflight stays locked with 423`);
        assertNoPermissiveCors(response.headers, `${route.action} locked response`);
        const payload = parseJsonResponse(response, `${route.action} locked response`);
        assertPreflightEnvelope(payload, route.action);
        assert.equal(payload.preflight.allowed, true, `${route.action} preflight passes request guards`);
        assert.deepEqual(payload.preflight.reasons, [], `${route.action} has no guard-failure reasons`);
        assert.match(payload.message, /Preflight passed, action still locked/i, `${route.action} explains action remains locked`);
        assert.match(payload.detail || payload.message, /no content changed/i, `${route.action} states no content changed`);
        assert.doesNotMatch(JSON.stringify(payload), /"(?:saved|previewed|published|unpublished|uploaded|success)"\s*:\s*true/i, `${route.action} is not reported as a content success`);
        assert.doesNotMatch(JSON.stringify(payload), /"writeEnabled"\s*:\s*true/i, `${route.action} never enables writes`);
        assertNoPrivateLeak(response.body, `${route.action} locked response`);
    }
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    const base = {
        remoteAddress: "127.0.0.1",
        headers: validHeaders(fixture.session)
    };
    const guardCases = [
        ["non-loopback-remote", { remoteAddress: "203.0.113.15" }],
        ["non-loopback-host", { headers: validHeaders(fixture.session, 8787, { host: "0.0.0.0:8787" }) }],
        ["host-mismatch", { headers: validHeaders(fixture.session, 8787, { host: "127.0.0.1:9999" }) }],
        ["origin-missing", { headers: validHeaders(fixture.session, 8787, { origin: "" }) }],
        ["origin-mismatch", { headers: validHeaders(fixture.session, 8787, { origin: "https://evil.example" }) }],
        ["session-token-missing", { headers: validHeaders(fixture.session, 8787, { [ADMIN_SESSION_HEADER]: "" }) }],
        ["session-token-invalid", { headers: validHeaders(fixture.session, 8787, { [ADMIN_SESSION_HEADER]: "SBR015_INVALID_TOKEN_SHOULD_NOT_ECHO" }) }],
        ["invalid-content-type", { headers: validHeaders(fixture.session, 8787, { "content-type": "text/plain" }) }]
    ];

    for (const [reason, override] of guardCases) {
        const response = await preflight(MUTATION_ROUTES[0], fixture, { ...base, ...override });
        assert.equal(response.statusCode, 403, `${reason} returns 403`);
        const payload = parseJsonResponse(response, `${reason} response`);
        assert.equal(payload.preflight.allowed, false, `${reason} is blocked`);
        assert.ok(payload.preflight.reasons.some((item) => item.code === reason), `${reason} appears as a safe reason code`);
        assert.match(payload.message, /Request blocked before content changed/i, `${reason} uses blocked-before-change copy`);
        assertNoPrivateLeak(response.body, `${reason} response`);
    }

    const optionsResponse = await preflight(MUTATION_ROUTES[2], fixture, {
        method: "OPTIONS",
        headers: validHeaders(fixture.session)
    });
    assert.equal(optionsResponse.statusCode, 403, "CORS preflight is denied");
    assertNoPermissiveCors(optionsResponse.headers, "OPTIONS response");
    const optionsPayload = parseJsonResponse(optionsResponse, "OPTIONS response");
    assert.equal(optionsPayload.action, "publish", "OPTIONS maps to the target action for diagnostics");
    assert.equal(optionsPayload.preflight.allowed, false, "OPTIONS is not allowed");
    assert.ok(optionsPayload.preflight.reasons.some((item) => item.code === "cors-preflight-blocked"), "OPTIONS reports cors-preflight-blocked");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot, { jsonBodyMaxBytes: 128 });
    const invalidBody = `{ "bodyMd": "${PRIVATE_SENTINELS[0]}", `;
    const hugeBody = `{ "bodyMd": "${PRIVATE_SENTINELS[2]}${"x".repeat(512 * 1024)}" }`;

    const blocked = await preflight(SAVE_ROUTE, fixture, { headers: { host: "127.0.0.1:8787", "content-type": "application/json" }, body: invalidBody });
    assert.equal(blocked.statusCode, 403, "guard failure invalid JSON stays blocked before content change");
    assert.doesNotMatch(blocked.body, /Unexpected end|SyntaxError/i, "guard failure invalid JSON still does not parse the body");
    assertNoPrivateLeak(blocked.body, "guard failure invalid JSON response");

    const invalidJson = await preflight(SAVE_ROUTE, fixture, { headers: validHeaders(fixture.session), body: invalidBody });
    assert.equal(invalidJson.statusCode, 400, "guard-passing invalid JSON now fails in the body intake gate");
    const invalidJsonPayload = parseJsonResponse(invalidJson, "invalid JSON response");
    assert.equal(invalidJsonPayload.action, "save", "invalid JSON response keeps save action mapping");
    assert.match(JSON.stringify(invalidJsonPayload.reasons || []), /malformed-json/i, "invalid JSON response uses safe malformed-json reason");
    assertNoPrivateLeak(invalidJson.body, "guard-passing invalid JSON response");

    const huge = await preflight(SAVE_ROUTE, fixture, { headers: validHeaders(fixture.session), body: hugeBody });
    assert.equal(huge.statusCode, 413, "guard-passing huge body now fails in the body intake gate");
    const hugePayload = parseJsonResponse(huge, "huge body response");
    assert.match(JSON.stringify(hugePayload.reasons || []), /request-body-too-large/i, "huge body response uses safe request-body-too-large reason");
    assertNoPrivateLeak(huge.body, "guard-passing huge body response");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot, { resume: { translations: { it: { title: "SBR015_PRIVATE_RESUME_VALUE" }, en: { title: "SBR015_PRIVATE_RESUME_VALUE" } } } });
    const beforeContent = await listRelative(fixture.contentRoot);
    const beforeAudit = await listRelative(fixture.auditRoot);
    const beforePublicAssets = await listRelative(fixture.publicAssetRoot);
    const manifestBefore = await fs.readFile(path.resolve("data/published.json"), "utf8");

    for (const route of LOCKED_MUTATION_ROUTES) {
        for (const headers of [{ host: "127.0.0.1:8787" }, validHeaders(fixture.session)]) {
            const response = await preflight(route, fixture, {
                headers,
                body: JSON.stringify({ bodyMd: PRIVATE_SENTINELS[1], href: PRIVATE_SENTINELS[4] })
            });
            assert.ok(response.statusCode === 403 || response.statusCode === 423, `${route.action} attempt is non-2xx`);
            const payload = parseJsonResponse(response, `${route.action} no-effect response`);
            assert.equal(payload.writeEnabled, false, `${route.action} keeps writes disabled`);
            assertNoPrivateLeak(response.body, `${route.action} no-effect response`);
        }
    }

    assert.deepEqual(await listRelative(fixture.contentRoot), beforeContent, "locked-route preflight attempts do not change content root");
    assert.deepEqual(await listRelative(fixture.auditRoot), beforeAudit, "locked-route preflight attempts do not change audit root");
    assert.deepEqual(await listRelative(fixture.publicAssetRoot), beforePublicAssets, "locked-route preflight attempts do not change public asset root");
    assert.equal(await fs.readFile(path.resolve("data/published.json"), "utf8"), manifestBefore, "locked-route preflight attempts do not rewrite published manifest");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);

    const health = await buildAdminResponse({ method: "GET", url: "/api/admin/health", remoteAddress: "127.0.0.1", config: fixture.config });
    const healthJson = parseJsonResponse(health, "health response");
    assert.equal(health.statusCode, 200, "health remains readable");
    assert.equal(healthJson.writeEnabled, true, "health reports writeEnabled=true for guarded draft save");
    assert.deepEqual(healthJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "health locked actions are unchanged");
    assert.doesNotMatch(JSON.stringify(healthJson), new RegExp(fixture.session.token, "g"), "health does not expose raw token");

    const editorial = await buildAdminResponse({ method: "GET", url: "/api/admin/editorial-summary", remoteAddress: "127.0.0.1", headers: validHeaders(fixture.session), config: fixture.config });
    const editorialJson = parseJsonResponse(editorial, "editorial response");
    assert.equal(editorial.statusCode, 200, "editorial summary remains readable with the private read header");
    assert.equal(editorialJson.writeEnabled, false, "editorial summary keeps writeEnabled=false");
    assert.ok(Array.isArray(editorialJson.editorial.areas), "editorial areas remain present");

    const resumeApi = await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validHeaders(fixture.session), config: fixture.config });
    const resumeJson = parseJsonResponse(resumeApi, "resume API response");
    assert.equal(resumeApi.statusCode, 200, "Resume read API remains readable with the private read header");
    assert.equal(resumeJson.writeEnabled, false, "Resume API keeps writeEnabled=false");
    assert.equal(resumeJson.document.id, "resume-main", "Resume document remains present");
    assert.ok(resumeJson.readiness, "Resume readiness remains present");

    const dashboard = await buildAdminResponse({ method: "GET", url: "/admin", remoteAddress: "127.0.0.1", config: fixture.config });
    assert.equal(dashboard.statusCode, 200, "private /admin remains readable");
    assert.match(dashboard.body, /data-admin-overlay-shell/i, "private /admin now renders the overlay utility strip");
    assert.match(dashboard.body, /admin mode \/ connected/i, "private /admin shows connected admin mode");
    assert.match(dashboard.body, /write enabled/i, "private /admin shows guarded draft-save capability");
    assertNoEnabledMutationControls(dashboard.body);

    const resumeEditor = await buildAdminResponse({ method: "GET", url: "/admin/resume", remoteAddress: "127.0.0.1", headers: { host: "127.0.0.1:8787" }, config: fixture.config });
    assert.equal(resumeEditor.statusCode, 200, "Resume editor remains readable");
    assert.match(resumeEditor.body, /data-admin-editor="resume"/, "Resume editor marker remains present");
    assert.match(resumeEditor.body, /data-admin-bootstrap="resume"/, "Resume editor now renders the protected bootstrap marker");
    assert.match(resumeEditor.body, /data-bootstrap-state="loading"/, "Resume editor now starts in bootstrap loading state");
    for (const action of LOCKED_ACTIONS) {
        assert.match(resumeEditor.body, new RegExp(`data-locked-action="${action}"`, "i"), `${action} stays locked in the editor bootstrap shell`);
    }
    assertNoEnabledMutationControls(resumeEditor.body);

    for (const [label, url] of [["blocked Resume API", "/api/admin/documents/resume-main"], ["blocked Resume editor", "/admin/resume"]]) {
        const blocked = await buildAdminResponse({ method: "GET", url, remoteAddress: "203.0.113.15", config: fixture.config });
        assert.equal(blocked.statusCode, 403, `${label} remains blocked from non-loopback`);
        assertNoPrivateLeak(blocked.body, label);
        assert.doesNotMatch(blocked.body, /document|validation|translations|data-field-path|data-editorial-area|data-count/i, `${label} remains redacted`);
    }
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    const beforeContent = await listRelative(fixture.contentRoot);
    const beforeAudit = await listRelative(fixture.auditRoot);
    const beforePublicAssets = await listRelative(fixture.publicAssetRoot);
    const manifestBefore = await fs.readFile(path.resolve("data/published.json"), "utf8");

    for (const [method, url] of [["POST", "/admin/resume"], ["DELETE", "/admin/resume"], ["POST", "/api/admin/unknown"], ["PATCH", "/api/admin/documents/unknown"]]) {
        const response = await buildAdminResponse({
            method,
            url,
            remoteAddress: "127.0.0.1",
            headers: validHeaders(fixture.session),
            body: PRIVATE_SENTINELS[0],
            config: fixture.config
        });
        assert.ok(response.statusCode >= 400, `${method} ${url} remains non-2xx`);
        const payload = parseJsonResponse(response, `${method} ${url} response`);
        assert.equal(payload.safeMode, true, `${method} ${url} keeps safeMode=true`);
        assert.equal(payload.writeEnabled, false, `${method} ${url} keeps writeEnabled=false`);
        assert.deepEqual(payload.actionsLocked, ADMIN_LOCKED_ACTIONS, `${method} ${url} keeps locked actions`);
        assertNoPrivateLeak(response.body, `${method} ${url} response`);
    }

    assert.deepEqual(await listRelative(fixture.contentRoot), beforeContent, "unsupported mutations do not change content root");
    assert.deepEqual(await listRelative(fixture.auditRoot), beforeAudit, "unsupported mutations do not change audit root");
    assert.deepEqual(await listRelative(fixture.publicAssetRoot), beforePublicAssets, "unsupported mutations do not change public asset root");
    assert.equal(await fs.readFile(path.resolve("data/published.json"), "utf8"), manifestBefore, "unsupported mutations do not rewrite published manifest");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot, { port: 0 });
    const running = await startAdminServer(fixture.config);
    const baseUrl = `http://${running.host}:${running.port}`;
    try {
        const response = await fetch(`${baseUrl}/api/admin/documents/resume-main`, {
            method: "PUT",
            headers: validHeaders(fixture.session, running.port),
            body: `{ "bodyMd": "${PRIVATE_SENTINELS[0]}", `
        });
        assert.equal(response.status, 400, "running server now reaches the body intake gate after valid preflight");
        assertNoPermissiveCors(Object.fromEntries(response.headers.entries()), "running server response");
        const text = await response.text();
        const payload = JSON.parse(text);
        assert.equal(payload.action, "save", "running server keeps save action mapping");
        assert.match(JSON.stringify(payload.reasons || []), /malformed-json/i, "running server reports safe malformed-json reason");
        assertNoPrivateLeak(text, "running server response");
    } finally {
        await running.close();
    }
});

for (const publicFile of PUBLIC_FILES) {
    const source = await fs.readFile(publicFile, "utf8");
    assert.doesNotMatch(source, /mutation-preflight|api\/admin\/uploads|api\/admin\/documents\/resume-main\/(?:preview|publish|unpublish)|x-sbar-admin-session|data-admin-editor|SBR015/i, `${publicFile} stays separated from private mutation preflight runtime`);
}
const publishedManifest = await fs.readFile("data/published.json", "utf8");
assert.doesNotMatch(publishedManifest, /mutation-preflight|api\/admin\/uploads|api\/admin\/documents\/resume-main|x-sbar-admin-session|SBR015/i, "published manifest is not wired to private mutation preflight APIs");

for (const packageFile of PACKAGE_FILES) {
    await assert.rejects(() => fs.access(packageFile), /ENOENT/, `${packageFile} was not introduced`);
}

console.log("SBR-015 admin mutation preflight guard integration assertions passed");
