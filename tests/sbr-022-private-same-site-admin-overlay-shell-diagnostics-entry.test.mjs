import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAdminResponse, createAdminConfig } from "../admin/server.js";
import { createAdminSession } from "../admin/session.js";
import {
    applyAdminOverlayState,
    buildAdminOverlayModel,
    getAdminOverlayView,
    summarizeEditorialState
} from "../admin/public/overlay.js";

const PRIVATE_SENTINELS = [
    "SBR022 Private Resume Title",
    "SBR022 private summary",
    "SBR022_PRIVATE_MD",
    "SBR022_PRIVATE_EMAIL@example.invalid"
];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-022-admin-"));
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
                title: "SBR022 Private Resume Title IT",
                summary: "SBR022 private summary IT",
                bodyMd: "# SBR022_PRIVATE_MD_IT",
                contacts: [{ label: "email", href: "mailto:SBR022_PRIVATE_EMAIL@example.invalid" }]
            },
            en: {
                title: "SBR022 Private Resume Title EN",
                summary: "SBR022 private summary EN",
                bodyMd: "# SBR022_PRIVATE_MD_EN"
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
        token: "SBR022_VALID_SESSION_TOKEN_FOR_TESTS_1234567890",
        now: () => new Date("2026-05-30T12:00:00.000Z")
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

function assertNoPrivateLeak(value, label = "payload") {
    for (const sentinel of PRIVATE_SENTINELS) {
        assert.doesNotMatch(value, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${label} does not leak ${sentinel}`);
    }
}

class FakeElement {
    constructor() {
        this.attrs = {};
        this.innerHTML = "";
        this.hidden = false;
    }

    setAttribute(name, value) {
        this.attrs[name] = String(value);
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    }
}

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);

    const overlay = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });

    assert.equal(overlay.statusCode, 200, "connected /admin succeeds");
    assert.match(overlay.headers["cache-control"] || "", /no-store/i, "/admin stays no-store");
    assert.match(overlay.headers["content-security-policy"] || "", /frame-ancestors\s+'none'/i, "/admin keeps anti-framing CSP");
    assert.match(overlay.headers["x-frame-options"] || "", /deny/i, "/admin keeps X-Frame-Options: DENY");
    assert.match(overlay.body, /data-shell-nav="sections"/i, "/admin reuses the public shell nav");
    assert.match(overlay.body, /data-admin-overlay-shell/i, "/admin renders the admin overlay strip marker");
    assert.match(overlay.body, /data-overlay-state="connected"/i, "/admin initial strip state is connected");
    assert.match(overlay.body, /admin mode \/ connected/i, "/admin initial strip names admin mode");
    assert.match(overlay.body, /write enabled/i, "/admin initial strip surfaces write capability");
    assert.match(overlay.body, /draft view \/ loading/i, "/admin initial strip keeps draft state non-data-bearing on first paint");
    assert.match(overlay.body, /Diagnostics/i, "/admin renders the diagnostics entry");
    assert.match(overlay.body, /src="script\.js\?v=/i, "/admin loads the shared public shell script");
    assert.match(overlay.body, /src="\/admin\/overlay\.js"/i, "/admin loads the private overlay bootstrap script");
    assert.match(overlay.body, /href="styles\.css"/i, "/admin reuses the shared public shell stylesheet");
    assert.match(overlay.body, /href="\/admin\/overlay\.css"/i, "/admin loads the overlay-only stylesheet");
    assert.doesNotMatch(overlay.body, /data-admin-bootstrap="dashboard"|class="admin-hero|class="guardrail-grid health-grid/i, "/admin no longer primary-renders the legacy dashboard-first surface");
    assertNoPrivateLeak(overlay.body, "/admin HTML");

    const manifest = await buildAdminResponse({
        method: "GET",
        url: "/data/published.json",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(manifest.statusCode, 200, "private origin serves published manifest for the shared shell");
    assert.match(manifest.headers["content-type"] || "", /application\/json/i, "manifest route is JSON");

    const script = await buildAdminResponse({
        method: "GET",
        url: "/script.js",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(script.statusCode, 200, "private origin serves shared script.js");
    assert.match(script.headers["content-type"] || "", /text\/javascript/i, "script.js route is JavaScript");

    const moduleFile = await buildAdminResponse({
        method: "GET",
        url: "/app/render.js",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(moduleFile.statusCode, 200, "private origin serves shared renderer modules");
    assert.match(moduleFile.headers["content-type"] || "", /text\/javascript/i, "renderer module route is JavaScript");

    const legacyEditor = await buildAdminResponse({
        method: "GET",
        url: "/admin/resume",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(legacyEditor.statusCode, 200, "legacy /admin/resume remains readable in this slice");
    assert.match(legacyEditor.body, /data-admin-bootstrap="resume"/i, "legacy Resume bootstrap shell remains present");
});

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);

    const blocked = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "203.0.113.9",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });

    assert.equal(blocked.statusCode, 403, "non-loopback /admin stays blocked");
    assert.match(blocked.body, /data-admin-overlay-shell/i, "blocked /admin still renders overlay shell marker");
    assert.match(blocked.body, /data-overlay-state="blocked"/i, "blocked /admin names blocked overlay state");
    assert.match(blocked.body, /admin mode \/ blocked/i, "blocked /admin names blocked admin mode");
    assert.doesNotMatch(blocked.body, /admin-session-token/i, "blocked /admin does not bootstrap the live session token");
    assertNoPrivateLeak(blocked.body, "blocked /admin HTML");
});

{
    assert.equal(getAdminOverlayView("#/resume"), "resume", "route helper resolves Resume hash");
    assert.equal(getAdminOverlayView("#/blog"), "blog", "route helper resolves Blog hash");
    assert.equal(getAdminOverlayView("#/resources"), "resources", "route helper resolves Resources hash");
    assert.equal(getAdminOverlayView("#/unknown"), "home", "route helper falls back to home");

    const editorial = {
        editorial: {
            status: "connected",
            detail: "protected editorial summary loaded",
            areas: [
                { key: "resume", counts: { draft: 1, ready: 0, published: 0, blocked: 0 } },
                { key: "blog", counts: { draft: 2, ready: 0, published: 0, blocked: 0 } },
                { key: "resources", counts: { draft: 0, ready: 0, published: 0, blocked: 0 } }
            ]
        }
    };
    const summary = summarizeEditorialState(editorial);
    assert.equal(summary.available, true, "editorial summary recognizes connected payload");
    assert.deepEqual(summary.totals, { draft: 3, ready: 0, published: 0, blocked: 0 }, "editorial summary totals drafts across areas");

    const connectedModel = buildAdminOverlayModel({
        view: "resume",
        sessionReady: true,
        health: { writeEnabled: true, health: { sshTunnel: { status: "connected" } } },
        editorial,
        resume: { document: { id: "resume-main", status: "draft" } },
        panelOpen: false
    });
    assert.equal(connectedModel.overlayState, "connected", "connected model stays connected");
    assert.equal(connectedModel.writeEnabled, true, "connected model advertises writes");
    assert.equal(connectedModel.draftVisible, true, "Resume draft becomes visible only in private admin Resume view");
    assert.equal(connectedModel.draftLabel, "draft / non-public", "Resume draft label is explicit");
    assert.equal(connectedModel.diagnosticsState, "unavailable", "diagnostics stay unavailable in this slice");

    const homeModel = buildAdminOverlayModel({
        view: "home",
        sessionReady: true,
        health: { writeEnabled: false, health: { sshTunnel: { status: "connected" } } },
        editorial,
        resume: { document: { id: "resume-main", status: "draft" } },
        panelOpen: false
    });
    assert.equal(homeModel.draftVisible, false, "draft marker does not appear outside the Resume route");
    assert.match(homeModel.draftLabel, /draft view \/ 3 drafts/i, "shell-level editorial state still names draft presence");

    const strip = new FakeElement();
    const panel = new FakeElement();
    const root = {
        querySelector(selector) {
            if (selector === "[data-admin-overlay-shell]") {
                return strip;
            }
            if (selector === "[data-admin-diagnostics-panel]") {
                return panel;
            }
            return null;
        }
    };

    applyAdminOverlayState(root, connectedModel);
    assert.equal(strip.getAttribute("data-overlay-state"), "connected", "strip receives connected state");
    assert.equal(strip.getAttribute("data-write-enabled"), "true", "strip records write-enabled state");
    assert.match(strip.innerHTML, /draft \/ non-public/i, "strip markup carries the Resume draft marker");
    assert.equal(panel.getAttribute("data-panel-state"), "closed", "diagnostics panel starts closed");
    assert.equal(panel.hidden, true, "closed diagnostics panel is hidden");

    applyAdminOverlayState(root, { ...connectedModel, panelOpen: true });
    assert.equal(panel.getAttribute("data-panel-state"), "unavailable", "open diagnostics panel advertises unavailable state");
    assert.equal(panel.hidden, false, "open diagnostics panel is visible");
    assert.match(panel.innerHTML, /Diagnostics unavailable/i, "open diagnostics panel keeps blocked\/unavailable shell copy");
}

console.log("SBR-022 private same-site admin overlay shell and diagnostics entry assertions passed");
