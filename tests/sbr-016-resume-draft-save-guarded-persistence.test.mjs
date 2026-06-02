import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAdminResponse, createAdminConfig, startAdminServer } from "../admin/server.js";
import { ADMIN_LOCKED_ACTIONS } from "../admin/health.js";
import { ADMIN_SESSION_HEADER, createAdminSession } from "../admin/session.js";
import { AUDIT_LOG_RELATIVE_PATH } from "../admin/audit.js";
import {
    buildResumeSaveRequest,
    collectDirtyResumeFields,
    describeResumeSaveState
} from "../admin/public/admin.js";

const PRIVATE_SENTINELS = [
    "SBR016_PRIVATE_BODY_SENTINEL",
    "javascript:alert('SBR016')",
    "../drafts/SBR016-private.md",
    "SBR016_SECRET_TOKEN_SHOULD_NOT_LEAK"
];
const SAVE_LOCKED_ACTIONS = ["preview", "publish", "unpublish", "upload"];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-016-admin-"));
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

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
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
        slug: "resume-main",
        status: "draft",
        createdAt: "2026-05-29T10:00:00.000Z",
        updatedAt: "2026-05-29T10:00:00.000Z",
        publishedAt: null,
        translations: {
            it: {
                title: "Titolo privato SBR016",
                summary: "Sintesi privata SBR016",
                bodyMd: "# Corpo privato SBR016",
                hero: {
                    headline: "Sistemi complessi, codice leggero",
                    actions: [
                        { label: "Email", href: "mailto:alessandro.sbarsi@gmail.com" },
                        { label: "GitHub", href: "https://github.com/falx" }
                    ]
                },
                facts: [{ label: "Focus", value: "performance" }],
                sections: [
                    { title: "Esperienza", items: [{ title: "Odoo", summary: "Automazioni" }] }
                ],
                skills: ["Odoo", "Git"]
            },
            en: {
                title: "SBR016 Private Title",
                summary: "SBR016 private summary",
                bodyMd: "# SBR016 private body",
                hero: {
                    headline: "Complex systems, lightweight code",
                    actions: [
                        { label: "Email", href: "mailto:alessandro.sbarsi@gmail.com" },
                        { label: "GitHub", href: "https://github.com/falx" }
                    ]
                },
                facts: [{ label: "Focus", value: "performance" }],
                sections: [
                    { title: "Experience", items: [{ title: "Odoo", summary: "Automation" }] }
                ],
                skills: ["Odoo", "Git"]
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

    if (!options.skipResumeWrite) {
        await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume(options.resume || {}));
    }

    const session = options.session || createAdminSession({
        token: "SBR016_VALID_SESSION_TOKEN_FOR_TESTS_1234567890",
        now: () => new Date("2026-05-29T15:00:00.000Z")
    });
    const config = createAdminConfig({
        host: "127.0.0.1",
        port: options.port ?? 0,
        contentRoot,
        auditRoot,
        publicAssetRoot,
        publishedManifestPath: path.resolve("data/published.json"),
        session,
        jsonBodyMaxBytes: options.jsonBodyMaxBytes
    });

    return { contentRoot, auditRoot, publicAssetRoot, session, config };
}

function validHeaders(session, port, overrides = {}) {
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

function assertNoPrivateLeak(value, label = "payload") {
    assert.doesNotMatch(value, /SBR016_SECRET_TOKEN_SHOULD_NOT_LEAK|SBR016_VALID_SESSION_TOKEN_FOR_TESTS_1234567890/i, `${label} does not leak token values`);
    assert.doesNotMatch(value, /Unexpected end|SyntaxError|JSON parse/i, `${label} does not leak parser internals`);
    assert.doesNotMatch(value, /\/tmp\/sbr-016-admin-|content\/documents|public-assets/i, `${label} does not leak temp filesystem paths`);
}

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    fixture.config.port = 8787;

    const editorResponse = await buildAdminResponse({
        method: "GET",
        url: "/admin/resume",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(editorResponse.statusCode, 200, "connected Resume editor renders");
    assert.match(editorResponse.body, /data-admin-editor="resume"/i, "Resume editor marker renders");
    assert.match(editorResponse.body, /data-admin-bootstrap="resume"/i, "Resume editor now renders a protected bootstrap marker");
    assert.match(editorResponse.body, /data-bootstrap-state="loading"/i, "Resume editor starts in bootstrap loading state");
    assert.doesNotMatch(editorResponse.body, /data-action="save"|data-save-state="clean"|data-field-path=|data-editor-language=|data-resume-form=/i, "initial Resume editor HTML no longer server-renders save controls or draft-bearing fields");
    assert.match(editorResponse.body, /data-locked-action="preview"/i, "Preview stays locked");
    assert.match(editorResponse.body, /data-locked-action="publish"/i, "Publish stays locked");
    assert.match(editorResponse.body, /data-locked-action="unpublish"/i, "Unpublish stays locked");
    assert.match(editorResponse.body, /data-locked-action="upload"/i, "Upload stays locked");

    const healthResponse = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/health",
        remoteAddress: "127.0.0.1",
        config: fixture.config
    });
    const healthJson = parseJsonResponse(healthResponse, "health response");
    assert.equal(healthResponse.statusCode, 200, "health remains readable");
    assert.equal(healthJson.writeEnabled, true, "health enables draft save capability");
    assert.deepEqual(healthJson.actionsLocked, SAVE_LOCKED_ACTIONS, "health locks only preview/publish/unpublish/upload");

    const dashboardResponse = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(dashboardResponse.statusCode, 200, "private /admin remains readable");
    assert.match(dashboardResponse.body, /data-admin-overlay-shell/i, "private /admin now renders the overlay utility strip");
    assert.match(dashboardResponse.body, /write enabled/i, "private /admin reports writeEnabled=true for save capability");
    assert.match(dashboardResponse.body, /Diagnostics/i, "private /admin keeps the diagnostics entry visible");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    fixture.config.port = 8787;
    const resumePath = path.join(fixture.contentRoot, "documents", "resume-main.json");
    const auditPath = path.join(fixture.auditRoot, AUDIT_LOG_RELATIVE_PATH);
    const manifestBefore = await fs.readFile(path.resolve("data/published.json"), "utf8");

    const response = await buildAdminResponse({
        method: "PUT",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validHeaders(fixture.session, 8787),
        body: JSON.stringify({
            documentId: "resume-main",
            fields: {
                "translations.it.title": "Titolo aggiornato SBR016",
                "translations.en.summary": "Updated private summary SBR016"
            }
        }),
        config: fixture.config
    });
    const payload = parseJsonResponse(response, "save response");
    assert.equal(response.statusCode, 200, "save succeeds with 200");
    assert.equal(payload.writeEnabled, true, "save response enables writes");
    assert.equal(payload.action, "save", "save response reports action");
    assert.equal(payload.document.id, "resume-main", "save response keeps singleton id");
    assert.equal(payload.document.status, "draft", "save remains a draft");
    assert.equal(payload.document.translations.it.title, "Titolo aggiornato SBR016", "IT patch is applied");
    assert.equal(payload.document.translations.en.summary, "Updated private summary SBR016", "EN patch is applied");
    assert.notEqual(payload.document.updatedAt, "2026-05-29T10:00:00.000Z", "updatedAt changes on save");
    assert.match(payload.message, /draft.*saved|saved.*draft/i, "response explains draft was saved");
    assert.match(payload.detail || payload.message, /not published|public site unchanged/i, "response explains save does not publish");
    assert.deepEqual(payload.actionsLocked, SAVE_LOCKED_ACTIONS, "save response keeps non-save actions locked");

    const savedDocument = await readJson(resumePath);
    assert.equal(savedDocument.translations.it.title, "Titolo aggiornato SBR016", "content file stores new IT title");
    assert.equal(savedDocument.translations.en.summary, "Updated private summary SBR016", "content file stores new EN summary");
    assert.equal(savedDocument.status, "draft", "content file remains a draft");
    assert.equal(await fs.readFile(path.resolve("data/published.json"), "utf8"), manifestBefore, "published manifest remains unchanged");

    const auditLines = (await fs.readFile(auditPath, "utf8")).trim().split(/\n+/).filter(Boolean);
    assert.equal(auditLines.length, 1, "successful save appends one audit record");
    const auditRecord = JSON.parse(auditLines[0]);
    assert.equal(auditRecord.action, "save", "audit record action is save");
    assert.equal(auditRecord.result, "saved", "audit record result is saved");
    assert.equal(auditRecord.target.id, "resume-main", "audit record target id is present");
    assert.doesNotMatch(JSON.stringify(auditRecord), /Titolo aggiornato SBR016|Updated private summary SBR016|SBR016_VALID_SESSION_TOKEN_FOR_TESTS_1234567890/i, "audit record remains redacted");
    assert.deepEqual(await listRelative(fixture.publicAssetRoot), [], "public assets remain unchanged");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    fixture.config.port = 8787;

    const response = await buildAdminResponse({
        method: "PUT",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validHeaders(fixture.session, 8787),
        body: JSON.stringify({
            documentId: "resume-main",
            fields: {
                "translations.en.summary": "   "
            }
        }),
        config: fixture.config
    });
    const payload = parseJsonResponse(response, "blank save response");
    assert.equal(response.statusCode, 200, "blank-but-safe string still saves as draft");
    assert.equal(payload.document.status, "draft", "blank save still remains draft");
    assert.ok(payload.readiness, "save response includes readiness");
    assert.equal(payload.readiness.state, "blocked", "blank localized string blocks readiness, not draft save");
    assert.match(JSON.stringify(payload.readiness.checks), /blank-string/i, "blank-string readiness diagnostic is exposed safely");
    assert.doesNotMatch(JSON.stringify(payload.readiness), /SBR016_VALID_SESSION_TOKEN_FOR_TESTS_1234567890/i, "readiness does not leak token values");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    fixture.config.port = 8787;
    const resumePath = path.join(fixture.contentRoot, "documents", "resume-main.json");
    const beforeDocument = await fs.readFile(resumePath, "utf8");

    for (const requestBody of [
        {
            documentId: "resume-main",
            fields: {
                status: "published"
            }
        },
        {
            documentId: "resume-main",
            fields: {
                "translations.it.newField": "should not be added"
            }
        },
        {
            documentId: "resume-main",
            fields: {
                "translations.it.facts": "not-an-array"
            }
        }
    ]) {
        const response = await buildAdminResponse({
            method: "PUT",
            url: "/api/admin/documents/resume-main",
            remoteAddress: "127.0.0.1",
            headers: validHeaders(fixture.session, 8787),
            body: JSON.stringify(requestBody),
            config: fixture.config
        });
        const payload = parseJsonResponse(response, "blocked structural save");
        assert.ok(response.statusCode >= 400, "structural or unauthorized edit is rejected");
        assert.equal(payload.action, "save", "rejection still reports save action");
        assert.match(JSON.stringify(payload.reasons || []), /unknown-field-path|non-string-field-path|metadata-field-locked|invalid-field-value/i, "rejection includes safe reason codes");
        assertNoPrivateLeak(response.body, "blocked structural save response");
        assert.equal(await fs.readFile(resumePath, "utf8"), beforeDocument, "blocked structural save leaves content unchanged");
    }
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    fixture.config.port = 8787;
    const resumePath = path.join(fixture.contentRoot, "documents", "resume-main.json");
    const beforeDocument = await fs.readFile(resumePath, "utf8");

    const response = await buildAdminResponse({
        method: "PUT",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validHeaders(fixture.session, 8787),
        body: JSON.stringify({
            documentId: "resume-main",
            fields: {
                "translations.it.hero.actions.0.href": PRIVATE_SENTINELS[2]
            }
        }),
        config: fixture.config
    });
    const payload = parseJsonResponse(response, "unsafe reference save");
    assert.equal(response.statusCode, 422, "unsafe reference save is blocked");
    assert.match(JSON.stringify(payload.reasons || []), /unsafe-reference/i, "unsafe reference rejection uses safe code");
    assert.match(JSON.stringify(payload.reasons || []), /translations\.it\.hero\.actions\.0\.href/i, "unsafe reference rejection names field path");
    assert.doesNotMatch(response.body, /\.\.\/drafts\/SBR016-private\.md|javascript:alert/i, "unsafe reference response does not echo raw unsafe value");
    assert.equal(await fs.readFile(resumePath, "utf8"), beforeDocument, "unsafe reference save leaves content unchanged");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot, { jsonBodyMaxBytes: 96 });
    fixture.config.port = 8787;
    const resumePath = path.join(fixture.contentRoot, "documents", "resume-main.json");
    const beforeDocument = await fs.readFile(resumePath, "utf8");
    const beforeAudit = await listRelative(fixture.auditRoot);
    const oversizedBody = JSON.stringify({
        documentId: "resume-main",
        fields: {
            "translations.it.bodyMd": `${PRIVATE_SENTINELS[0]}-${"x".repeat(512)}`
        }
    });

    const response = await buildAdminResponse({
        method: "PUT",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validHeaders(fixture.session, 8787),
        body: oversizedBody,
        config: fixture.config
    });
    const payload = parseJsonResponse(response, "oversized save response");
    assert.equal(response.statusCode, 413, "oversized save body is rejected with 413");
    assert.match(JSON.stringify(payload.reasons || []), /request-body-too-large/i, "oversized response uses a deterministic safe reason code");
    assert.equal(await fs.readFile(resumePath, "utf8"), beforeDocument, "oversized save leaves content unchanged");
    assert.deepEqual(await listRelative(fixture.auditRoot), beforeAudit, "oversized body does not write audit files before parsing");
    assertNoPrivateLeak(response.body, "oversized save response");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot, { skipResumeWrite: true });
    fixture.config.port = 8787;

    const editorResponse = await buildAdminResponse({
        method: "GET",
        url: "/admin/resume",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(editorResponse.statusCode, 200, "degraded editor still renders");
    assert.match(editorResponse.body, /data-admin-bootstrap="resume"/i, "degraded editor still uses the protected bootstrap shell");
    assert.doesNotMatch(editorResponse.body, /data-action="save"/i, "save action is not enabled in the initial shell when the singleton document is missing");

    const saveResponse = await buildAdminResponse({
        method: "PUT",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validHeaders(fixture.session, 8787),
        body: JSON.stringify({
            documentId: "resume-main",
            fields: {
                "translations.it.title": "Should not save"
            }
        }),
        config: fixture.config
    });
    const savePayload = parseJsonResponse(saveResponse, "missing document save response");
    assert.ok(saveResponse.statusCode >= 400, "save is non-2xx when the singleton document is missing");
    assert.match(JSON.stringify(savePayload.reasons || []), /missing-resume-document|resume-document-unavailable/i, "missing document rejection is safe and deterministic");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    fixture.config.port = 8787;
    const beforeContent = await listRelative(fixture.contentRoot);
    const beforeAudit = await listRelative(fixture.auditRoot);
    const beforePublicAssets = await listRelative(fixture.publicAssetRoot);
    const manifestBefore = await fs.readFile(path.resolve("data/published.json"), "utf8");

    for (const headers of [
        validHeaders(fixture.session, 8787, { origin: "" }),
        validHeaders(fixture.session, 8787, { host: "127.0.0.1:9999" }),
        validHeaders(fixture.session, 8787, { [ADMIN_SESSION_HEADER]: "SBR016_SECRET_TOKEN_SHOULD_NOT_LEAK" }),
        validHeaders(fixture.session, 8787, { "content-type": "text/plain" })
    ]) {
        const response = await buildAdminResponse({
            method: "PUT",
            url: "/api/admin/documents/resume-main",
            remoteAddress: "127.0.0.1",
            headers,
            body: JSON.stringify({
                documentId: "resume-main",
                fields: {
                    "translations.it.title": PRIVATE_SENTINELS[0]
                }
            }),
            config: fixture.config
        });
        const payload = parseJsonResponse(response, "blocked preflight save response");
        assert.equal(response.statusCode, 403, "save preflight failure remains blocked");
        assert.equal(payload.action, "save", "blocked save preflight still reports action");
        assert.equal(payload.preflight.allowed, false, "blocked save preflight remains false");
        assertNoPrivateLeak(response.body, "blocked preflight save response");
    }

    const optionsResponse = await buildAdminResponse({
        method: "OPTIONS",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validHeaders(fixture.session, 8787),
        config: fixture.config
    });
    const optionsPayload = parseJsonResponse(optionsResponse, "OPTIONS save response");
    assert.equal(optionsResponse.statusCode, 403, "save CORS preflight is denied");
    assert.equal(optionsPayload.action, "save", "OPTIONS save response maps to save action");
    assert.ok(optionsPayload.preflight.reasons.some((item) => item.code === "cors-preflight-blocked"), "OPTIONS save reports cors-preflight-blocked");

    assert.deepEqual(await listRelative(fixture.contentRoot), beforeContent, "blocked save preflight leaves content unchanged");
    assert.deepEqual(await listRelative(fixture.auditRoot), beforeAudit, "blocked save preflight leaves audit unchanged");
    assert.deepEqual(await listRelative(fixture.publicAssetRoot), beforePublicAssets, "blocked save preflight leaves public assets unchanged");
    assert.equal(await fs.readFile(path.resolve("data/published.json"), "utf8"), manifestBefore, "blocked save preflight leaves published manifest unchanged");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    const beforeDocument = await readJson(path.join(fixture.contentRoot, "documents", "resume-main.json"));
    await fs.rm(fixture.auditRoot, { recursive: true, force: true });
    fixture.config.port = 8787;

    const response = await buildAdminResponse({
        method: "PUT",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validHeaders(fixture.session, 8787),
        body: JSON.stringify({
            documentId: "resume-main",
            fields: {
                "translations.it.title": "Should fail without audit root"
            }
        }),
        config: fixture.config
    });
    const payload = parseJsonResponse(response, "missing audit root response");
    assert.ok(response.statusCode >= 500 || response.statusCode === 422, "save fails when audit root is unavailable");
    assert.match(JSON.stringify(payload.reasons || []), /audit-root-unavailable|audit-write-failed/i, "audit failure uses safe reason codes");
    const afterDocument = await readJson(path.join(fixture.contentRoot, "documents", "resume-main.json"));
    assert.deepEqual(afterDocument, beforeDocument, "failed audit leaves content file unchanged");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot, { port: 0 });
    const running = await startAdminServer({
        host: "127.0.0.1",
        port: 0,
        contentRoot: fixture.contentRoot,
        auditRoot: fixture.auditRoot,
        publicAssetRoot: fixture.publicAssetRoot,
        publishedManifestPath: path.resolve("data/published.json"),
        session: fixture.session
    });

    try {
        const response = await fetch(`http://${running.host}:${running.port}/api/admin/documents/resume-main`, {
            method: "PUT",
            headers: validHeaders(fixture.session, running.port),
            body: JSON.stringify({
                documentId: "resume-main",
                fields: {
                    "translations.en.title": "Saved through running server"
                }
            })
        });
        assert.equal(response.status, 200, "running server accepts protected save");
        const payload = await response.json();
        assert.equal(payload.document.translations.en.title, "Saved through running server", "running server stores the patch");
    } finally {
        await running.close();
    }
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);
    await fs.rm(fixture.auditRoot, { recursive: true, force: true });
    fixture.config.port = 8787;

    const health = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/health",
        remoteAddress: "127.0.0.1",
        config: fixture.config
    });
    const healthJson = parseJsonResponse(health, "missing-audit health response");
    assert.equal(health.statusCode, 200, "health remains readable when audit storage is missing");
    assert.equal(healthJson.writeEnabled, false, "health should not advertise draft save when audit storage is unavailable");

    const dashboard = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "127.0.0.1",
        config: fixture.config
    });
    assert.equal(dashboard.statusCode, 200, "dashboard remains readable when audit storage is missing");
    assert.doesNotMatch(dashboard.body, /save draft enabled/i, "dashboard should not advertise enabled save when audit storage is missing");
});

class FakeMeta {
    constructor(content) {
        this.content = content;
    }

    getAttribute(name) {
        return name === "content" ? this.content : "";
    }
}

class FakeControl {
    constructor(fieldPath, value) {
        this.attrs = {
            "data-field-path": fieldPath,
            "data-editable": "true"
        };
        this.value = value;
        this.listeners = {};
    }

    getAttribute(name) {
        return this.attrs[name] || "";
    }

    addEventListener(name, handler) {
        this.listeners[name] = handler;
    }
}

class FakeStateText {
    constructor() {
        this.attrs = {};
        this.textContent = "";
        this.focusCount = 0;
    }

    setAttribute(name, value) {
        this.attrs[name] = value;
    }

    focus() {
        this.focusCount += 1;
    }
}

class FakeSummary {
    constructor() {
        this.textContent = "";
    }
}

class FakeButton {
    constructor() {
        this.disabled = true;
    }
}

class FakeForm {
    constructor() {
        this.attrs = {
            "data-document-id": "resume-main",
            "data-resume-form": "resume-main"
        };
        this.listeners = {};
        this.controls = [new FakeControl("translations.it.title", "Original title")];
        this.button = new FakeButton();
        this.stateText = new FakeStateText();
        this.summary = new FakeSummary();
    }

    getAttribute(name) {
        return this.attrs[name] || "";
    }

    setAttribute(name, value) {
        this.attrs[name] = value;
    }

    querySelectorAll(selector) {
        if (selector === "[data-editable='true'][data-field-path]") {
            return this.controls;
        }

        return [];
    }

    querySelector(selector) {
        if (selector === "[data-action='save']") {
            return this.button;
        }

        if (selector === "[data-save-state-text]") {
            return this.stateText;
        }

        if (selector === "[data-save-summary]") {
            return this.summary;
        }

        return null;
    }

    addEventListener(name, handler) {
        this.listeners[name] = handler;
    }
}

function createFakeDocument(form) {
    const meta = new Map([
        ["meta[name=\"admin-session-header\"]", new FakeMeta(ADMIN_SESSION_HEADER)],
        ["meta[name=\"admin-session-token\"]", new FakeMeta("SBR016_FAKE_BROWSER_TOKEN")],
        ["meta[name=\"resume-save-endpoint\"]", new FakeMeta("/api/admin/documents/resume-main")]
    ]);

    return {
        readyState: "loading",
        querySelectorAll(selector) {
            if (selector === "[data-resume-form]") {
                return [form];
            }

            return [];
        },
        querySelector(selector) {
            return meta.get(selector) || null;
        },
        addEventListener(name, handler) {
            if (name === "DOMContentLoaded") {
                this._ready = handler;
            }
        }
    };
}

async function withClientModuleDocument(fakeDocument, fetchImpl, suffix, run) {
    const previousDocument = globalThis.document;
    const previousFetch = globalThis.fetch;

    globalThis.document = fakeDocument;
    globalThis.fetch = fetchImpl;

    try {
        await import(`../admin/public/admin.js?${suffix}`);
        fakeDocument._ready();
        await run();
    } finally {
        globalThis.document = previousDocument;
        globalThis.fetch = previousFetch;
    }
}

{
    const form = new FakeForm();
    const fakeDocument = createFakeDocument(form);
    await withClientModuleDocument(
        fakeDocument,
        async () => ({
            ok: true,
            json: async () => ({
                document: {
                    updatedAt: "2026-05-30T01:00:00.000Z"
                }
            })
        }),
        `success-${Date.now()}`,
        async () => {
            form.controls[0].value = "Changed title";
            form.controls[0].listeners.input();
            await form.listeners.submit({ preventDefault() {} });

            assert.equal(form.stateText.textContent, "saved draft", "successful browser save keeps the visible terminal saved state");
            assert.equal(form.attrs["data-save-state"], "saved", "successful browser save keeps saved state marker until the next edit");
            assert.match(form.summary.textContent, /public site unchanged|draft saved/i, "successful browser save keeps a visible saved summary");
        }
    );
}

{
    const form = new FakeForm();
    const fakeDocument = createFakeDocument(form);
    await withClientModuleDocument(
        fakeDocument,
        async () => ({
            ok: false,
            json: async () => ({
                detail: "Audit storage unavailable for test."
            })
        }),
        `error-${Date.now()}`,
        async () => {
            form.controls[0].value = "Changed title";
            form.controls[0].listeners.input();
            await form.listeners.submit({ preventDefault() {} });

            assert.equal(form.stateText.textContent, "error", "failed browser save keeps the visible terminal error state");
            assert.equal(form.attrs["data-save-state"], "error", "failed browser save keeps error state marker until the next edit");
            assert.match(form.summary.textContent, /Audit storage unavailable for test/i, "failed browser save keeps the visible error summary");
        }
    );
}

{
    const initialValues = {
        "translations.it.title": "Titolo iniziale",
        "translations.en.title": "Initial title",
        "translations.it.bodyMd": "# body"
    };
    const currentValues = {
        ...initialValues,
        "translations.en.title": "Updated title",
        "translations.it.bodyMd": "# body\n\nextra"
    };
    assert.deepEqual(collectDirtyResumeFields(initialValues, initialValues), {}, "unchanged values produce no dirty save fields");
    assert.deepEqual(collectDirtyResumeFields(initialValues, currentValues), {
        "translations.en.title": "Updated title",
        "translations.it.bodyMd": "# body\n\nextra"
    }, "dirty save fields contain changed string leaves only");
    assert.deepEqual(buildResumeSaveRequest({ documentId: "resume-main", initialValues, currentValues }), {
        documentId: "resume-main",
        fields: {
            "translations.en.title": "Updated title",
            "translations.it.bodyMd": "# body\n\nextra"
        }
    }, "client save request payload is deterministic");
    assert.equal(describeResumeSaveState("clean").label, "clean", "client exposes clean save state label");
    assert.equal(describeResumeSaveState("dirty").label, "dirty", "client exposes dirty save state label");
    assert.equal(describeResumeSaveState("saving").label, "saving", "client exposes saving save state label");
    assert.equal(describeResumeSaveState("saved", { updatedAt: "2026-05-29T16:00:00.000Z" }).label, "saved draft", "client exposes saved draft label");
    assert.equal(describeResumeSaveState("error", { message: "No content changed." }).label, "error", "client exposes error save state label");
}

assert.deepEqual(ADMIN_LOCKED_ACTIONS, SAVE_LOCKED_ACTIONS, "health locked actions contract excludes save");
console.log("SBR-016 resume draft save guarded persistence assertions passed");
