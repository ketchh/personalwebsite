import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAdminResponse, createAdminConfig } from "../admin/server.js";
import { ADMIN_SESSION_HEADER, createAdminSession } from "../admin/session.js";
import { buildPrivateAdminReadHeaders, initAdminBootstrap } from "../admin/public/admin.js";

const PRIVATE_SENTINELS = [
    "SBR021 Private Resume Title",
    "SBR021 private summary",
    "SBR021_PRIVATE_MD",
    "SBR021_PRIVATE_EMAIL@example.invalid"
];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-021-admin-"));
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

function completeResume(overrides = {}) {
    return {
        id: "resume-main",
        type: "resume",
        slug: "resume-main",
        status: "draft",
        createdAt: "2026-05-30T10:00:00.000Z",
        updatedAt: "2026-05-30T10:00:00.000Z",
        publishedAt: null,
        translations: {
            it: {
                title: "SBR021 Private Resume Title IT",
                summary: "SBR021 private summary IT",
                bodyMd: "# SBR021_PRIVATE_MD_IT",
                contacts: [{ label: "email", href: "mailto:SBR021_PRIVATE_EMAIL@example.invalid" }]
            },
            en: {
                title: "SBR021 Private Resume Title EN",
                summary: "SBR021 private summary EN",
                bodyMd: "# SBR021_PRIVATE_MD_EN"
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

    const session = options.session || createAdminSession({
        token: "SBR021_VALID_SESSION_TOKEN_FOR_TESTS_1234567890",
        now: () => new Date("2026-05-30T11:00:00.000Z")
    });
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

function validReadHeaders(session, port = 8787, overrides = {}) {
    return {
        host: `127.0.0.1:${port}`,
        [ADMIN_SESSION_HEADER]: session.token,
        ...overrides
    };
}

function validSaveHeaders(session, port = 8787, overrides = {}) {
    return {
        host: `127.0.0.1:${port}`,
        origin: `http://127.0.0.1:${port}`,
        "content-type": "application/json; charset=utf-8",
        [ADMIN_SESSION_HEADER]: session.token,
        ...overrides
    };
}

function parseJsonResponse(response, label = "response") {
    assert.match(response.headers["content-type"], /application\/json/i, `${label} is JSON`);
    return JSON.parse(response.body);
}

function assertAntiFramingHeaders(headers, label = "response") {
    assert.match(headers["cache-control"] || "", /no-store/i, `${label} stays no-store`);
    assert.match(headers["content-security-policy"] || "", /frame-ancestors\s+'none'/i, `${label} sets frame-ancestors none`);
    assert.match(headers["x-frame-options"] || "", /deny/i, `${label} sets X-Frame-Options: DENY`);
}

function assertNoPrivateLeak(value, label = "payload") {
    for (const sentinel of PRIVATE_SENTINELS) {
        assert.doesNotMatch(value, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${label} does not leak ${sentinel}`);
    }
}

class FakeMeta {
    constructor(content) {
        this.content = content;
    }

    getAttribute(name) {
        return name === "content" ? this.content : null;
    }
}

class FakeBootstrapContainer {
    constructor(kind) {
        this.kind = kind;
        this.innerHTML = "";
        this.attrs = { "data-bootstrap-state": "loading" };
    }

    setAttribute(name, value) {
        this.attrs[name] = value;
    }

    getAttribute(name) {
        return this.attrs[name] || null;
    }
}

function createFakeBootstrapDocument({ kind, includeToken = true } = {}) {
    const container = new FakeBootstrapContainer(kind);
    const meta = new Map([
        ["meta[name=\"admin-session-header\"]", new FakeMeta(ADMIN_SESSION_HEADER)],
        ["meta[name=\"admin-health-endpoint\"]", new FakeMeta("/api/admin/health")],
        ["meta[name=\"admin-editorial-summary-endpoint\"]", new FakeMeta("/api/admin/editorial-summary")],
        ["meta[name=\"admin-resume-document-endpoint\"]", new FakeMeta("/api/admin/documents/resume-main")],
        ["meta[name=\"resume-save-endpoint\"]", new FakeMeta("/api/admin/documents/resume-main")]
    ]);

    if (includeToken) {
        meta.set("meta[name=\"admin-session-token\"]", new FakeMeta("SBR021_FAKE_BROWSER_TOKEN"));
    }

    return {
        container,
        querySelector(selector) {
            if (selector === `[data-admin-bootstrap="${kind}"]`) {
                return container;
            }

            return meta.get(selector) || null;
        }
    };
}

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);

    const dashboard = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(dashboard.statusCode, 200, "connected /admin succeeds");
    assertAntiFramingHeaders(dashboard.headers, "/admin HTML");
    assert.match(dashboard.body, /data-shell-nav="sections"/i, "/admin reuses the same-site shell nav");
    assert.match(dashboard.body, /data-admin-overlay-shell/i, "/admin renders overlay utility-strip marker");
    assert.match(dashboard.body, /data-overlay-state="connected"/i, "/admin starts in connected overlay shell state");
    assert.doesNotMatch(dashboard.body, /data-admin-bootstrap="dashboard"|data-editorial-area|data-count=|editorial-count|editorial-diagnostics/i, "/admin initial HTML does not render legacy dashboard cards, editorial counts, or diagnostics lists");
    assertNoPrivateLeak(dashboard.body, "/admin HTML");

    const resume = await buildAdminResponse({
        method: "GET",
        url: "/admin/resume",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(resume.statusCode, 200, "connected /admin/resume succeeds");
    assertAntiFramingHeaders(resume.headers, "/admin/resume HTML");
    assert.match(resume.body, /data-admin-bootstrap="resume"/i, "/admin/resume renders resume bootstrap marker");
    assert.match(resume.body, /data-bootstrap-state="loading"/i, "/admin/resume starts in loading bootstrap state");
    assert.doesNotMatch(resume.body, /data-field-path=|data-resume-readiness=|data-readiness-check=|data-parity-path=|data-resume-form=|data-action="save"/i, "/admin/resume initial HTML does not render draft-bearing editor controls or readiness details");
    assertNoPrivateLeak(resume.body, "/admin/resume HTML");

    const blockedEditorialNoHeader = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/editorial-summary",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(blockedEditorialNoHeader.statusCode, 403, "editorial summary requires session header");
    assertNoPrivateLeak(blockedEditorialNoHeader.body, "editorial summary without header");
    assert.doesNotMatch(blockedEditorialNoHeader.body, /"editorial"\s*:\s*\{|"areas"\s*:\s*\[/i, "blocked editorial summary exposes no editorial payload");

    const blockedEditorialBadToken = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/editorial-summary",
        remoteAddress: "127.0.0.1",
        headers: validReadHeaders(fixture.session, 8787, { [ADMIN_SESSION_HEADER]: "SBR021_INVALID_TOKEN" }),
        config: fixture.config
    });
    assert.equal(blockedEditorialBadToken.statusCode, 403, "invalid editorial summary token is blocked");
    assertNoPrivateLeak(blockedEditorialBadToken.body, "editorial summary invalid token");
    assert.doesNotMatch(blockedEditorialBadToken.body, /SBR021_INVALID_TOKEN/i, "blocked editorial summary does not echo invalid token");

    const blockedEditorialHost = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/editorial-summary",
        remoteAddress: "127.0.0.1",
        headers: validReadHeaders(fixture.session, 8787, { host: "127.0.0.1:9999" }),
        config: fixture.config
    });
    assert.equal(blockedEditorialHost.statusCode, 403, "non-exact Host blocks editorial summary");

    const allowedEditorial = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/editorial-summary",
        remoteAddress: "127.0.0.1",
        headers: validReadHeaders(fixture.session),
        config: fixture.config
    });
    const allowedEditorialJson = parseJsonResponse(allowedEditorial, "allowed editorial summary");
    assert.equal(allowedEditorial.statusCode, 200, "valid editorial summary read succeeds");
    assert.match(allowedEditorial.headers["cache-control"] || "", /no-store/i, "editorial summary stays no-store");
    assert.ok(Array.isArray(allowedEditorialJson.editorial.areas), "allowed editorial summary keeps editorial payload");

    const blockedDocumentNoHeader = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(blockedDocumentNoHeader.statusCode, 403, "Resume document read requires session header");
    assertNoPrivateLeak(blockedDocumentNoHeader.body, "Resume document without header");
    assert.doesNotMatch(blockedDocumentNoHeader.body, /"document"\s*:\s*\{|"readiness"\s*:\s*\{/i, "blocked Resume document read exposes no document payload or readiness");

    const blockedDocumentBadToken = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validReadHeaders(fixture.session, 8787, { [ADMIN_SESSION_HEADER]: "SBR021_INVALID_TOKEN" }),
        config: fixture.config
    });
    assert.equal(blockedDocumentBadToken.statusCode, 403, "invalid Resume document token is blocked");
    assertNoPrivateLeak(blockedDocumentBadToken.body, "Resume document invalid token");

    const blockedDocumentHost = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validReadHeaders(fixture.session, 8787, { host: "127.0.0.1:9999" }),
        config: fixture.config
    });
    assert.equal(blockedDocumentHost.statusCode, 403, "non-exact Host blocks Resume document read");

    const allowedDocument = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validReadHeaders(fixture.session),
        config: fixture.config
    });
    const allowedDocumentJson = parseJsonResponse(allowedDocument, "allowed Resume document read");
    assert.equal(allowedDocument.statusCode, 200, "valid Resume document read succeeds");
    assert.match(allowedDocument.headers["cache-control"] || "", /no-store/i, "Resume document read stays no-store");
    assert.equal(allowedDocumentJson.document.id, "resume-main", "allowed Resume document read keeps document payload");
    assert.ok(allowedDocumentJson.readiness, "allowed Resume document read keeps readiness payload");

    const health = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/health",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(health.statusCode, 200, "health remains readable without private read header");

    const saveResponse = await buildAdminResponse({
        method: "PUT",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validSaveHeaders(fixture.session),
        body: JSON.stringify({
            documentId: "resume-main",
            fields: {
                "translations.en.title": "Updated SBR021 private title"
            }
        }),
        config: fixture.config
    });
    const saveJson = parseJsonResponse(saveResponse, "save response");
    assert.equal(saveResponse.statusCode, 200, "guarded save path remains available");
    assert.equal(saveJson.document.translations.en.title, "Updated SBR021 private title", "guarded save still updates the private draft");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot, {
        session: createAdminSession({
            token: "SBR021_CUSTOM_HEADER_TOKEN_1234567890",
            headerName: "x-sbar-local-session",
            now: () => new Date("2026-05-30T11:30:00.000Z")
        })
    });

    const customHeaderRead = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: {
            host: "127.0.0.1:8787",
            [fixture.session.headerName]: fixture.session.token
        },
        config: fixture.config
    });
    const customHeaderReadJson = parseJsonResponse(customHeaderRead, "custom-header read response");
    assert.equal(customHeaderRead.statusCode, 200, "configured custom session header unlocks authenticated private Resume reads");
    assert.equal(customHeaderReadJson.document.id, "resume-main", "custom session header keeps Resume payload readable");

    const customHeaderSave = await buildAdminResponse({
        method: "PUT",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: {
            host: "127.0.0.1:8787",
            origin: "http://127.0.0.1:8787",
            "content-type": "application/json; charset=utf-8",
            [fixture.session.headerName]: fixture.session.token
        },
        body: JSON.stringify({
            documentId: "resume-main",
            fields: {
                "translations.en.title": "Updated via custom session header"
            }
        }),
        config: fixture.config
    });
    const customHeaderSaveJson = parseJsonResponse(customHeaderSave, "custom-header save response");
    assert.equal(customHeaderSave.statusCode, 200, "configured custom session header unlocks guarded save");
    assert.equal(customHeaderSaveJson.document.translations.en.title, "Updated via custom session header", "custom session header still drives the guarded save path");
});

{
    assert.deepEqual(buildPrivateAdminReadHeaders({ headerName: ADMIN_SESSION_HEADER, token: "SBR021_TEST_TOKEN" }), {
        [ADMIN_SESSION_HEADER]: "SBR021_TEST_TOKEN"
    }, "client helper builds deterministic private read headers");
    assert.equal(buildPrivateAdminReadHeaders({ headerName: ADMIN_SESSION_HEADER, token: "" }), null, "client helper blocks missing private read token");
}

{
    const calls = [];
    const fakeDocument = createFakeBootstrapDocument({ kind: "dashboard" });
    const previousFetch = globalThis.fetch;

    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url, options });

        if (url === "/api/admin/health") {
            return {
                ok: true,
                json: async () => ({ writeEnabled: true })
            };
        }

        if (url === "/api/admin/editorial-summary") {
            return {
                ok: true,
                json: async () => ({
                    editorial: {
                        status: "connected",
                        detail: "protected editorial summary loaded",
                        areas: [
                            { key: "resume", label: "Resume", counts: { draft: 1, ready: 0, published: 0, blocked: 0 } }
                        ],
                        diagnostics: []
                    }
                })
            };
        }

        throw new Error(`Unexpected fetch ${url}`);
    };

    try {
        await initAdminBootstrap(fakeDocument);
        assert.deepEqual(calls[0], { url: "/api/admin/health", options: {} }, "dashboard bootstrap reads health without a private read header");
        assert.equal(calls[1].url, "/api/admin/editorial-summary", "dashboard bootstrap reads protected editorial data");
        assert.equal(calls[1].options.headers[ADMIN_SESSION_HEADER], "SBR021_FAKE_BROWSER_TOKEN", "dashboard bootstrap sends the private read header for editorial data");
        assert.equal(fakeDocument.container.getAttribute("data-bootstrap-state"), "ready", "dashboard bootstrap settles to ready on authenticated success");
        assert.match(fakeDocument.container.innerHTML, /data-editorial-area="resume"/i, "dashboard bootstrap renders hydrated editorial markup after authenticated read");
    } finally {
        globalThis.fetch = previousFetch;
    }
}

{
    const calls = [];
    const fakeDocument = createFakeBootstrapDocument({ kind: "resume" });
    const previousFetch = globalThis.fetch;

    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url, options });

        if (url === "/api/admin/health") {
            return {
                ok: true,
                json: async () => ({ writeEnabled: true })
            };
        }

        if (url === "/api/admin/documents/resume-main") {
            return {
                ok: true,
                json: async () => ({
                    statusCode: 200,
                    state: "ready",
                    reason: "Resume document state is available.",
                    validation: { state: "ready", reasons: [] },
                    readiness: { state: "ready", reason: "Resume readiness is available.", checks: [] },
                    document: {
                        id: "resume-main",
                        status: "draft",
                        translations: {
                            it: { title: "Titolo privato", bodyMd: "# IT" },
                            en: { title: "Private title", bodyMd: "# EN" }
                        }
                    },
                    actionsLocked: ["preview", "publish", "unpublish", "upload"]
                })
            };
        }

        throw new Error(`Unexpected fetch ${url}`);
    };

    try {
        await initAdminBootstrap(fakeDocument);
        assert.equal(calls[1].url, "/api/admin/documents/resume-main", "resume bootstrap reads protected Resume data");
        assert.equal(calls[1].options.headers[ADMIN_SESSION_HEADER], "SBR021_FAKE_BROWSER_TOKEN", "resume bootstrap sends the private read header for Resume data");
        assert.equal(fakeDocument.container.getAttribute("data-bootstrap-state"), "ready", "resume bootstrap settles to ready on authenticated success");
        assert.match(fakeDocument.container.innerHTML, /data-resume-form="resume-main"/i, "resume bootstrap renders the hydrated save form after authenticated read");
        assert.match(fakeDocument.container.innerHTML, /data-action="save"/i, "resume bootstrap renders the save action only after authenticated read");
        assert.match(fakeDocument.container.innerHTML, /data-field-path="translations\.it\.title"/i, "resume bootstrap renders private field controls only after authenticated read");
    } finally {
        globalThis.fetch = previousFetch;
    }
}

{
    const fakeDocument = createFakeBootstrapDocument({ kind: "resume", includeToken: false });
    await initAdminBootstrap(fakeDocument);
    assert.equal(fakeDocument.container.getAttribute("data-bootstrap-state"), "blocked", "resume bootstrap stays blocked when the private read token is missing");
    assert.doesNotMatch(fakeDocument.container.innerHTML, /data-action="save"|data-field-path=/i, "blocked resume bootstrap does not reveal save controls or draft fields");
}

console.log("SBR-021 private admin read/bootstrap hardening assertions passed");
