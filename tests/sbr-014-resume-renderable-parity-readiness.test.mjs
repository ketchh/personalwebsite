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
const MUTATION_TARGETS = [
    "/admin/resume",
    "/api/admin/documents/resume-main",
    "/api/admin/documents/resume-main/preview",
    "/api/admin/documents/resume-main/publish",
    "/api/admin/documents/resume-main/unpublish"
];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-014-admin-"));
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

function createBaseConfig({ contentRoot, auditRoot, publicAssetRoot, session } = {}) {
    return createAdminConfig({
        host: "127.0.0.1",
        port: 8787,
        contentRoot,
        auditRoot,
        publicAssetRoot,
        publishedManifestPath: path.resolve("data/published.json"),
        session
    });
}

function validReadHeaders(config, overrides = {}) {
    return {
        host: `127.0.0.1:${config.port}`,
        [ADMIN_SESSION_HEADER]: config.session.token,
        ...overrides
    };
}

function completeResume(overrides = {}) {
    return {
        id: "resume-main",
        type: "resume",
        status: "draft",
        slug: "resume-main",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:00.000Z",
        translations: {
            it: {
                title: "SBR014 Titolo privato",
                summary: "SBR014 sintesi privata",
                bodyMd: "# SBR014 Corpo privato",
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
                title: "SBR014 Private Title",
                summary: "SBR014 private summary",
                bodyMd: "# SBR014 Private body",
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

function mergeTranslations(nextTranslations) {
    const base = completeResume();
    return {
        ...base,
        translations: {
            it: { ...base.translations.it, ...(nextTranslations.it || {}) },
            en: { ...base.translations.en, ...(nextTranslations.en || {}) }
        }
    };
}

function getCheck(readiness, key) {
    const check = readiness.checks.find((item) => item.key === key);
    assert.ok(check, `${key} readiness check exists`);
    return check;
}

function getReadinessSection(html) {
    const match = html.match(/<section[^>]*data-resume-readiness[\s\S]*?<\/section>/i);
    assert.ok(match, "readiness checklist section is present");
    return match[0];
}

function assertNoEnabledMutationControls(value, { allowSave = false } = {}) {
    const enabledActionPattern = allowSave
        ? /data-action="(?:preview|publish|unpublish|upload)"/i
        : /data-action="(?:save|preview|publish|unpublish|upload)"/i;
    const enabledButtonPattern = allowSave
        ? /<button[^>]*>\s*(?:Preview|Publish|Unpublish|Upload)\b/i
        : /<button[^>]*>\s*(?:Save draft|Save|Preview|Publish|Unpublish|Upload)\b/i;

    assert.doesNotMatch(value, enabledActionPattern, "no unexpected enabled mutation data-action markers render");
    assert.doesNotMatch(value, enabledButtonPattern, "no unexpected enabled mutation buttons render");
}

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume());
    const config = createBaseConfig({ contentRoot, auditRoot, publicAssetRoot });

    const apiResponse = await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config });
    assert.equal(apiResponse.statusCode, 200, "connected Resume API remains readable with the private read header");
    const apiJson = JSON.parse(apiResponse.body);
    assert.equal(apiJson.writeEnabled, false, "Resume API keeps writeEnabled=false");
    assert.deepEqual(apiJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "locked actions are unchanged");
    assert.equal(apiJson.document.id, "resume-main", "SBR-013 document output remains present");
    assert.equal(apiJson.validation.state, "ready", "SBR-013 validation output remains present");
    assert.equal(apiJson.readiness.writeEnabled, false, "readiness keeps writeEnabled=false");
    assert.equal(apiJson.readiness.publishEnabled, false, "readiness keeps publishEnabled=false");
    assert.equal(apiJson.readiness.state, "ready-but-locked", "valid mirrored Resume is ready but locked");
    assert.equal(apiJson.readiness.renderableFieldParity.state, "ready", "renderable parity passes");
    assert.deepEqual(apiJson.readiness.renderableFieldParity.diagnostics, [], "ready parity has no diagnostics");
    assert.equal(getCheck(apiJson.readiness, "it-translation").state, "passed", "IT translation presence passes");
    assert.equal(getCheck(apiJson.readiness, "en-translation").state, "passed", "EN translation presence passes");
    assert.equal(getCheck(apiJson.readiness, "localized-field-completeness").state, "passed", "localized completeness passes");
    assert.equal(getCheck(apiJson.readiness, "renderable-field-parity").state, "passed", "field parity check passes");
    assert.equal(getCheck(apiJson.readiness, "safe-references").state, "passed", "safe reference passthrough passes");
    assert.equal(getCheck(apiJson.readiness, "publish-guardrails").state, "locked", "publish guardrail stays locked");
    assert.match(JSON.stringify(apiJson.readiness), /publish.*locked|locked.*publish/i, "readiness states publishing remains locked");
    assert.doesNotMatch(JSON.stringify(apiJson.readiness), /"(?:publish|preview|save|unpublish|upload|export|manifestWrite)Enabled"\s*:\s*true/i, "readiness exposes no enabled capabilities");

    const adminResponse = await buildAdminResponse({ method: "GET", url: "/admin/resume", remoteAddress: "127.0.0.1", headers: { host: "127.0.0.1:8787" }, config });
    assert.equal(adminResponse.statusCode, 200, "connected Resume editor renders");
    assert.match(adminResponse.body, /data-admin-bootstrap="resume"/i, "Resume editor now renders the protected bootstrap marker");
    assert.match(adminResponse.body, /data-bootstrap-state="loading"/i, "Resume editor now starts in bootstrap loading state");
    assert.doesNotMatch(adminResponse.body, /data-resume-readiness=|data-readiness-check=|data-parity-path=|data-action="save"|data-field-path=/i, "initial Resume editor HTML no longer server-renders readiness details or save controls");
    assertNoEnabledMutationControls(adminResponse.body);
    for (const action of LOCKED_ACTIONS) {
        assert.match(adminResponse.body, new RegExp(`data-locked-action="${action}"`, "i"), `${action} locked affordance remains present in the bootstrap shell`);
    }
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    const config = createBaseConfig({ contentRoot, auditRoot, publicAssetRoot });
    const resumePath = path.join(contentRoot, "documents", "resume-main.json");

    await writeJson(resumePath, {
        id: "resume-main",
        type: "resume",
        status: "draft",
        translations: { it: { title: "Solo IT title", summary: "Solo IT summary" } }
    });
    const missingWholeEn = JSON.parse((await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config })).body);
    assert.equal(missingWholeEn.readiness.state, "blocked", "missing whole EN translation blocks readiness");
    assert.equal(missingWholeEn.readiness.renderableFieldParity.state, "blocked", "missing whole EN translation blocks parity");
    assert.match(JSON.stringify(missingWholeEn.readiness.renderableFieldParity.diagnostics), /missing-in-en/i, "missing whole EN translation reports missing-in-en diagnostics");
    assert.match(JSON.stringify(missingWholeEn.readiness.renderableFieldParity.diagnostics), /title|summary/i, "missing whole EN translation names IT field paths");
    assert.doesNotMatch(JSON.stringify(missingWholeEn.readiness), /Solo IT title|Solo IT summary/i, "missing whole EN diagnostics do not echo private values");

    await writeJson(resumePath, {
        id: "resume-main",
        type: "resume",
        status: "draft",
        translations: { en: { title: "Only EN title", summary: "Only EN summary" } }
    });
    const missingWholeIt = JSON.parse((await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config })).body);
    assert.equal(missingWholeIt.readiness.state, "blocked", "missing whole IT translation blocks readiness");
    assert.equal(missingWholeIt.readiness.renderableFieldParity.state, "blocked", "missing whole IT translation blocks parity");
    assert.match(JSON.stringify(missingWholeIt.readiness.renderableFieldParity.diagnostics), /missing-in-it/i, "missing whole IT translation reports missing-in-it diagnostics");
    assert.match(JSON.stringify(missingWholeIt.readiness.renderableFieldParity.diagnostics), /title|summary/i, "missing whole IT translation names EN field paths");
    assert.doesNotMatch(JSON.stringify(missingWholeIt.readiness), /Only EN title|Only EN summary/i, "missing whole IT diagnostics do not echo private values");

    await writeJson(resumePath, mergeTranslations({ it: { sideProject: "Solo IT private value" } }));
    const missingInEn = JSON.parse((await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config })).body);
    assert.equal(missingInEn.readiness.state, "blocked", "extra IT field blocks readiness");
    assert.equal(missingInEn.readiness.renderableFieldParity.state, "blocked", "extra IT field blocks parity");
    assert.match(JSON.stringify(missingInEn.readiness.renderableFieldParity.diagnostics), /missing-in-en/i, "missing-in-en diagnostic is present");
    assert.match(JSON.stringify(missingInEn.readiness.renderableFieldParity.diagnostics), /sideProject/i, "missing-in-en diagnostic names field path");
    assert.doesNotMatch(JSON.stringify(missingInEn.readiness), /Solo IT private value/i, "missing path diagnostic does not echo private value");

    await writeJson(resumePath, mergeTranslations({ en: { sideProject: "Only EN private value" } }));
    const missingInIt = JSON.parse((await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config })).body);
    assert.equal(missingInIt.readiness.state, "blocked", "extra EN field blocks readiness");
    assert.match(JSON.stringify(missingInIt.readiness.renderableFieldParity.diagnostics), /missing-in-it/i, "missing-in-it diagnostic is present");
    assert.match(JSON.stringify(missingInIt.readiness.renderableFieldParity.diagnostics), /sideProject/i, "missing-in-it diagnostic names field path");
    assert.doesNotMatch(JSON.stringify(missingInIt.readiness), /Only EN private value/i, "missing path diagnostic does not echo private value");

    await writeJson(resumePath, mergeTranslations({ en: { summary: ["shape mismatch private value"] } }));
    const shape = JSON.parse((await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config })).body);
    assert.equal(shape.readiness.state, "blocked", "incompatible leaf shape blocks readiness");
    assert.match(JSON.stringify(shape.readiness.renderableFieldParity.diagnostics), /incompatible-kind/i, "incompatible-kind diagnostic is present");
    assert.match(JSON.stringify(shape.readiness.renderableFieldParity.diagnostics), /summary/i, "shape diagnostic names path");
    assert.match(JSON.stringify(shape.readiness.renderableFieldParity.diagnostics), /string/i, "shape diagnostic names expected kind");
    assert.match(JSON.stringify(shape.readiness.renderableFieldParity.diagnostics), /array/i, "shape diagnostic names actual kind");
    assert.doesNotMatch(JSON.stringify(shape.readiness), /shape mismatch private value/i, "shape diagnostic does not echo private value");

    await writeJson(resumePath, mergeTranslations({ en: { title: "   " } }));
    const blank = JSON.parse((await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config })).body);
    assert.equal(blank.readiness.state, "blocked", "blank localized field blocks readiness");
    assert.match(JSON.stringify(blank.readiness.checks), /blank-string/i, "blank-string diagnostic is present");
    assert.match(JSON.stringify(blank.readiness.checks), /en/i, "blank-string diagnostic names language");
    assert.match(JSON.stringify(blank.readiness.checks), /title/i, "blank-string diagnostic names field path");

    await writeJson(resumePath, mergeTranslations({
        it: {
            sections: [
                { title: "Esperienza", items: [{ title: "Odoo", summary: "Automazioni" }] },
                { title: "Extra", items: [{ title: "SBR014 private item", summary: "Private" }] }
            ]
        }
    }));
    const arrayMismatch = JSON.parse((await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config })).body);
    assert.equal(arrayMismatch.readiness.state, "blocked", "array length mismatch blocks readiness");
    assert.match(JSON.stringify(arrayMismatch.readiness.renderableFieldParity.diagnostics), /sections\[1\]|sections\.1/i, "array mismatch diagnostic has deterministic indexed path");
    assert.doesNotMatch(JSON.stringify(arrayMismatch.readiness), /SBR014 private item/i, "array mismatch diagnostic does not echo private list value");

    await writeJson(resumePath, mergeTranslations({ it: { hero: { actions: [{ label: "Private", href: "..\\drafts\\resume.md" }] } } }));
    const unsafe = JSON.parse((await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config })).body);
    assert.equal(unsafe.state, "blocked", "unsafe reference keeps SBR-013 validation blocked");
    assert.equal(unsafe.readiness.state, "blocked", "unsafe reference blocks readiness");
    assert.equal(getCheck(unsafe.readiness, "safe-references").state, "failed", "safe reference readiness check fails");
    assert.match(JSON.stringify(getCheck(unsafe.readiness, "safe-references")), /translations\.it\.hero\.actions\.0\.href/i, "safe reference readiness check points to existing validation field path");
    assert.doesNotMatch(JSON.stringify(unsafe.readiness), /\.\.\\drafts\\resume\.md/i, "safe reference readiness check does not echo raw unsafe value");
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), mergeTranslations({ it: { title: "SBR014_SECRET_TITLE" } }));
    const config = createBaseConfig({ contentRoot, auditRoot, publicAssetRoot });
    const blockedSessionConfig = createBaseConfig({
        contentRoot,
        auditRoot,
        publicAssetRoot,
        session: { id: "missing", token: "", headerName: "x-sbar-admin-session", createdAt: null }
    });

    for (const [label, blockedConfig, remoteAddress] of [
        ["non-loopback", config, "203.0.113.14"],
        ["blocked session", blockedSessionConfig, "127.0.0.1"]
    ]) {
        const blockedApi = await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress, headers: { host: `127.0.0.1:${blockedConfig.port}` }, config: blockedConfig });
        assert.equal(blockedApi.statusCode, 403, `${label} Resume readiness API is blocked`);
        assert.doesNotMatch(blockedApi.body, /readiness|renderableFieldParity|data-parity-path|SBR014_SECRET_TITLE|field completeness|editorial/i, `${label} API exposes no readiness or private values`);

        const blockedEditor = await buildAdminResponse({ method: "GET", url: "/admin/resume", remoteAddress, config: blockedConfig });
        assert.equal(blockedEditor.statusCode, 403, `${label} Resume editor is blocked`);
        assert.doesNotMatch(blockedEditor.body, /data-resume-readiness|data-readiness-check|data-parity-path|SBR014_SECRET_TITLE|data-editorial-area|data-count/i, `${label} editor exposes no readiness or editorial data`);
    }

    const missingContentRoot = path.join(tempRoot, "missing-content");
    const missingConfig = createBaseConfig({ contentRoot: missingContentRoot, auditRoot, publicAssetRoot });
    const missingApi = await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress: "127.0.0.1", headers: validReadHeaders(missingConfig), config: missingConfig });
    assert.ok(missingApi.statusCode >= 400, "missing content root remains non-2xx");
    assert.doesNotMatch(missingApi.body, /SBR014_SECRET_TITLE|renderableFieldParity|data-parity-path/i, "missing/degraded response exposes no private values or parity internals");
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume());
    const config = createBaseConfig({ contentRoot, auditRoot, publicAssetRoot });

    const health = await buildAdminResponse({ method: "GET", url: "/api/admin/health", remoteAddress: "127.0.0.1", config });
    const healthJson = JSON.parse(health.body);
    assert.equal(health.statusCode, 200, "health API remains available");
    assert.equal(healthJson.writeEnabled, true, "health API reports writeEnabled=true for guarded draft save");
    assert.deepEqual(healthJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "health API locked actions are unchanged");
    assert.ok(Array.isArray(healthJson.guardrails), "health guardrails remain present");

    const editorial = await buildAdminResponse({ method: "GET", url: "/api/admin/editorial-summary", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config });
    const editorialJson = JSON.parse(editorial.body);
    assert.equal(editorial.statusCode, 200, "editorial summary API remains available");
    assert.equal(editorialJson.writeEnabled, false, "editorial summary keeps writeEnabled=false");
    assert.deepEqual(editorialJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "editorial API locked actions are unchanged");
    assert.ok(Array.isArray(editorialJson.editorial.areas), "editorial areas remain present");

    const beforeContent = await listRelative(contentRoot);
    const beforeAudit = await listRelative(auditRoot);
    const beforePublicAssets = await listRelative(publicAssetRoot);
    const manifestBefore = await fs.readFile(path.resolve("data/published.json"), "utf8");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        for (const target of MUTATION_TARGETS) {
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

for (const publicFile of PUBLIC_FILES) {
    const source = await fs.readFile(publicFile, "utf8");
    assert.doesNotMatch(source, /api\/admin\/documents\/resume-main|\/admin\/resume|data-admin-editor|data-resume-readiness|data-parity-path|SBR014/i, `${publicFile} stays separated from private Resume readiness runtime`);
}
const publishedManifest = await fs.readFile("data/published.json", "utf8");
assert.doesNotMatch(publishedManifest, /api\/admin\/documents\/resume-main|data-resume-readiness|SBR014/i, "published manifest is not wired to private readiness API");

for (const packageFile of PACKAGE_FILES) {
    await assert.rejects(() => fs.access(packageFile), /ENOENT/, `${packageFile} was not introduced`);
}

console.log("SBR-014 resume renderable parity readiness assertions passed");
