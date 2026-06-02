import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAdminResponse, createAdminConfig } from "../admin/server.js";
import { ADMIN_SESSION_HEADER, createAdminSession } from "../admin/session.js";
import {
    applyPrivateResumeDraftLayer,
    buildPrivateResumeDraftModel,
    renderPrivateResumeDraftMarkup
} from "../admin/public/overlay.js";

const PRIVATE_SENTINELS = [
    "SBR023 private IT title",
    "SBR023 private IT summary",
    "SBR023 private EN title",
    "SBR023 private EN summary",
    "SBR023_PRIVATE_BODY_IT",
    "SBR023_PRIVATE_BODY_EN",
    "mailto:sbr023-private@example.invalid"
];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-023-admin-"));
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
                title: "SBR023 private IT title",
                summary: "SBR023 private IT summary",
                bodyMd: "# SBR023_PRIVATE_BODY_IT\nUna riga privata di bozza.",
                contacts: [{ label: "Email", href: "mailto:sbr023-private@example.invalid" }]
            },
            en: {
                title: "SBR023 private EN title",
                summary: "SBR023 private EN summary",
                bodyMd: "# SBR023_PRIVATE_BODY_EN\nA private draft line.",
                contacts: [{ label: "Email", href: "mailto:sbr023-private@example.invalid" }]
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
        token: "SBR023_VALID_SESSION_TOKEN_FOR_TESTS_1234567890",
        now: () => new Date("2026-05-30T13:00:00.000Z")
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

function parseJsonResponse(response, label = "response") {
    assert.match(response.headers["content-type"] || "", /application\/json/i, `${label} is JSON`);
    return JSON.parse(response.body);
}

function assertNoPrivateLeak(value, label = "payload") {
    for (const sentinel of PRIVATE_SENTINELS) {
        assert.doesNotMatch(value, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${label} does not leak ${sentinel}`);
    }
}

class FakeStage {
    constructor() {
        this.attrs = {};
        this.innerHTML = '<section class="card hero-card"><h1>Published resume copy</h1></section>';
    }

    setAttribute(name, value) {
        this.attrs[name] = String(value);
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    }
}

class FakeRoot {
    constructor(stage) {
        this.stage = stage;
    }

    querySelector(selector) {
        if (selector === "[data-page-rail-stage]") {
            return this.stage;
        }

        return null;
    }
}

await withTempDir(async (tempRoot) => {
    const fixture = await createFixture(tempRoot);

    const adminShell = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(adminShell.statusCode, 200, "connected /admin succeeds");
    assert.match(adminShell.body, /data-admin-overlay-shell/i, "/admin keeps the same-site admin shell");
    assert.doesNotMatch(adminShell.body, /SBR023 private IT title|SBR023 private EN title|SBR023_PRIVATE_BODY_/i, "/admin initial HTML stays non-data-bearing");
    assertNoPrivateLeak(adminShell.body, "/admin HTML");

    const compatibilityEditor = await buildAdminResponse({
        method: "GET",
        url: "/admin/resume",
        remoteAddress: "127.0.0.1",
        headers: { host: "127.0.0.1:8787" },
        config: fixture.config
    });
    assert.equal(compatibilityEditor.statusCode, 200, "legacy /admin/resume stays readable");
    assert.match(compatibilityEditor.body, /data-admin-bootstrap="resume"/i, "legacy Resume bootstrap shell remains present");
    assertNoPrivateLeak(compatibilityEditor.body, "/admin/resume HTML");

    const resumeRead = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validReadHeaders(fixture.session),
        config: fixture.config
    });
    const resumePayload = parseJsonResponse(resumeRead, "private Resume read");
    assert.equal(resumeRead.statusCode, 200, "authenticated private Resume read succeeds");

    const itDraft = buildPrivateResumeDraftModel({
        view: "resume",
        overlayState: "connected",
        resume: resumePayload,
        language: "it"
    });
    assert.equal(itDraft.active, true, "private IT Resume draft model is active on admin Resume route");
    assert.equal(itDraft.language, "it", "IT draft model keeps language");
    assert.equal(itDraft.title, "SBR023 private IT title", "IT draft model uses private title");
    assert.equal(itDraft.summary, "SBR023 private IT summary", "IT draft model uses private summary");
    assert.match(itDraft.body, /SBR023_PRIVATE_BODY_IT/i, "IT draft model keeps private body excerpt");
    assert.equal(itDraft.contacts[0].href, "mailto:sbr023-private@example.invalid", "IT draft model keeps private contact values");

    const itMarkup = renderPrivateResumeDraftMarkup(itDraft);
    assert.match(itMarkup, /draft \/ non-public/i, "IT draft markup names draft / non-public state");
    assert.match(itMarkup, /SBR023 private IT title/i, "IT draft markup renders the private title");
    assert.match(itMarkup, /SBR023 private IT summary/i, "IT draft markup renders the private summary");
    assert.match(itMarkup, /SBR023_PRIVATE_BODY_IT/i, "IT draft markup renders private route-level body content");
    assert.match(itMarkup, /mailto:sbr023-private@example.invalid/i, "IT draft markup renders private contact content");

    const enDraft = buildPrivateResumeDraftModel({
        view: "resume",
        overlayState: "connected",
        resume: resumePayload,
        language: "en"
    });
    assert.equal(enDraft.active, true, "private EN Resume draft model is active on admin Resume route");
    assert.equal(enDraft.language, "en", "EN draft model keeps language");
    assert.equal(enDraft.title, "SBR023 private EN title", "EN draft model uses private title");
    assert.equal(enDraft.summary, "SBR023 private EN summary", "EN draft model uses private summary");
    assert.match(renderPrivateResumeDraftMarkup(enDraft), /SBR023_PRIVATE_BODY_EN/i, "EN draft markup follows the active private translation");

    const nonResumeDraft = buildPrivateResumeDraftModel({
        view: "blog",
        overlayState: "connected",
        resume: resumePayload,
        language: "it"
    });
    assert.equal(nonResumeDraft.active, false, "private draft layer stays off outside the Resume route");

    const blockedDraft = buildPrivateResumeDraftModel({
        view: "resume",
        overlayState: "blocked",
        resume: { state: "blocked" },
        language: "it"
    });
    assert.equal(blockedDraft.active, false, "blocked private Resume read does not activate in-context draft rendering");
    assert.equal(renderPrivateResumeDraftMarkup(blockedDraft), "", "blocked private Resume read renders no draft markup");

    const stage = new FakeStage();
    const root = new FakeRoot(stage);
    applyPrivateResumeDraftLayer(root, itDraft);
    assert.equal(stage.getAttribute("data-admin-resume-draft-visible"), "true", "private Resume stage records visible draft state");
    assert.match(stage.innerHTML, /draft \/ non-public/i, "private Resume stage includes page-surface draft treatment");
    assert.match(stage.innerHTML, /Published resume copy/i, "private Resume stage keeps the shared Resume shell content underneath the draft layer");

    applyPrivateResumeDraftLayer(root, blockedDraft);
    assert.equal(stage.getAttribute("data-admin-resume-draft-visible"), "false", "blocked private Resume stage clears visible draft state");
    assert.doesNotMatch(stage.innerHTML, /draft \/ non-public|SBR023 private IT title|SBR023_PRIVATE_BODY_IT/i, "blocked private Resume stage strips in-context private draft markup");

    const publicShell = await fs.readFile("index.html", "utf8");
    const publicManifest = await fs.readFile("data/published.json", "utf8");
    assertNoPrivateLeak(publicShell, "public index.html");
    assertNoPrivateLeak(publicManifest, "public manifest");
});

await withTempDir(async (tempRoot) => {
    const baseResume = completeResume();
    const fixture = await createFixture(tempRoot, {
        resume: {
            translations: {
                ...baseResume.translations,
                it: {
                    ...baseResume.translations.it,
                    contacts: [{ label: "Unsafe", href: "../drafts/private-resume.md" }]
                }
            }
        }
    });

    const blockedRead = await buildAdminResponse({
        method: "GET",
        url: "/api/admin/documents/resume-main",
        remoteAddress: "127.0.0.1",
        headers: validReadHeaders(fixture.session),
        config: fixture.config
    });
    const blockedPayload = parseJsonResponse(blockedRead, "blocked private Resume read");
    assert.equal(blockedRead.statusCode, 422, "unsafe private Resume reference blocks the read model");
    assert.equal(blockedPayload.state, "blocked", "unsafe private Resume reference keeps blocked state");
    assert.ok(blockedPayload.document, "identity-valid blocked payload still carries a document body");

    const blockedModelWithDocument = buildPrivateResumeDraftModel({
        view: "resume",
        overlayState: "connected",
        resume: blockedPayload,
        language: "it"
    });
    assert.equal(blockedModelWithDocument.active, false, "blocked private Resume payload with a document body must not activate in-context draft rendering");
    assert.equal(renderPrivateResumeDraftMarkup(blockedModelWithDocument), "", "blocked private Resume payload with a document body renders no draft markup");

    const stage = new FakeStage();
    const root = new FakeRoot(stage);
    applyPrivateResumeDraftLayer(root, blockedModelWithDocument);
    assert.doesNotMatch(stage.innerHTML, /draft \/ non-public|SBR023 private IT title|private-resume\.md/i, "blocked private Resume payload with a document body does not leak draft markup into the page surface");
});

console.log("SBR-023 private Resume in-context draft rendering assertions passed");
