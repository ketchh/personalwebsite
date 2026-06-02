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
const MUTATION_TARGETS = [
    "/admin/resume",
    "/api/admin/documents/resume-main",
    "/api/admin/documents/resume-main/preview",
    "/api/admin/documents/resume-main/publish",
    "/api/admin/documents/resume-main/unpublish"
];
const LOCKED_ACTIONS = ["preview", "publish", "unpublish", "upload"];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-013-admin-"));
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

function readResumeApi(config, overrides = {}) {
    const nextConfig = overrides.config || config;
    return buildAdminResponse({
        method: "GET",
        url: "/api/admin/documents/resume-main",
        remoteAddress: overrides.remoteAddress || "127.0.0.1",
        headers: overrides.headers || validReadHeaders(nextConfig, overrides.headerOverrides),
        config: nextConfig
    });
}

function readResumeShell(config, overrides = {}) {
    const nextConfig = overrides.config || config;
    return buildAdminResponse({
        method: "GET",
        url: "/admin/resume",
        remoteAddress: overrides.remoteAddress || "127.0.0.1",
        headers: overrides.headers || { host: `127.0.0.1:${nextConfig.port}` },
        config: nextConfig
    });
}

function completeResume(overrides = {}) {
    return {
        id: "resume-main",
        type: "resume",
        status: "draft",
        slug: "resume-main",
        translations: {
            it: {
                title: "SBR013 Titolo <script>alert('it')</script>",
                summary: "SBR013 sintesi & performance",
                bodyMd: "# SBR013 corpo IT\n<script>alert('md')</script>",
                hero: {
                    headline: "SBR013 Hero <b>IT</b>",
                    actions: [
                        { label: "Email", href: "mailto:alessandro.sbarsi@gmail.com" },
                        { label: "GitHub", href: "https://github.com/falx" }
                    ]
                },
                facts: [{ label: "Focus", value: "sistemi complessi" }],
                sections: [{ title: "Esperienza", items: [{ label: "Odoo", summary: "Automazioni leggere" }] }],
                skills: ["Odoo", "Git", "performance"],
                contacts: [{ label: "Email", href: "mailto:alessandro.sbarsi@gmail.com" }]
            },
            en: {
                title: "SBR013 Title <script>alert('en')</script>",
                summary: "SBR013 summary & performance",
                bodyMd: "# SBR013 body EN\n<script>alert('md-en')</script>",
                hero: {
                    headline: "SBR013 Hero <b>EN</b>",
                    actions: [{ label: "Email", href: "mailto:alessandro.sbarsi@gmail.com" }]
                },
                facts: [{ label: "Focus", value: "complex systems" }],
                sections: [{ title: "Experience", items: [{ label: "Odoo", summary: "Lightweight automation" }] }],
                skills: ["Odoo", "Git", "performance"],
                contacts: [{ label: "Email", href: "mailto:alessandro.sbarsi@gmail.com" }]
            }
        },
        ...overrides
    };
}

function assertNoEnabledMutationControls(html, { allowSave = false } = {}) {
    const enabledActionPattern = allowSave
        ? /data-action="(?:preview|publish|unpublish|upload)"/i
        : /data-action="(?:save|preview|publish|unpublish|upload)"/i;
    const enabledButtonPattern = allowSave
        ? /<button[^>]*>\s*(?:Preview|Publish|Unpublish|Upload)\b/i
        : /<button[^>]*>\s*(?:Save draft|Save|Preview|Publish|Unpublish|Upload)\b/i;

    assert.doesNotMatch(html, enabledActionPattern, "no unexpected enabled mutation data-action markers render");
    assert.doesNotMatch(html, enabledButtonPattern, "no unexpected enabled mutation buttons render");
}

function assertNoSecretValues(value, label = "response") {
    assert.doesNotMatch(
        value,
        /SBR013_SECRET|SBR013_BLOCKED_TITLE|SBR013_BLOCKED_SUMMARY|SBR013_BLOCKED_BODY|blocked@example\.invalid|outside-secret/i,
        `${label} does not expose blocked private Resume values`
    );
}

function assertResumeBootstrapShell(html, label = "Resume editor shell") {
    assert.match(html, /data-admin-editor="resume"/i, `${label} keeps editor root marker`);
    assert.match(html, /data-admin-bootstrap="resume"/i, `${label} renders protected bootstrap marker`);
    assert.match(html, /data-bootstrap-state="loading"/i, `${label} starts in bootstrap loading state`);
    assert.match(html, /protected bootstrap|loading protected Resume state/i, `${label} explains the protected bootstrap boundary`);
    assert.doesNotMatch(html, /data-field-path=|data-editor-language=|data-resume-readiness=|data-readiness-check=|data-parity-path=|data-resume-form=|data-action="save"/i, `${label} does not server-render draft-bearing controls or readiness details`);
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

    const apiResponse = await readResumeApi(config);
    assert.equal(apiResponse.statusCode, 200, "connected Resume document API succeeds with the private read header");
    const apiJson = JSON.parse(apiResponse.body);
    assert.equal(apiJson.writeEnabled, false, "Resume document API keeps writeEnabled=false");
    assert.deepEqual(apiJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "Resume document API reuses existing locked actions");
    assert.equal(apiJson.state, "ready", "valid draft Resume is classified as ready for future publish checks");
    assert.equal(apiJson.validation.state, "ready", "validation summary is ready");
    assert.equal(apiJson.document.id, "resume-main", "document id is exposed through private read API");
    assert.equal(apiJson.document.type, "resume", "document type is exposed through private read API");
    assert.equal(apiJson.document.status, "draft", "document status is exposed through private read API");
    assert.equal(apiJson.document.translations.it.title, "SBR013 Titolo <script>alert('it')</script>", "IT translation is readable through private API");
    assert.equal(apiJson.document.translations.en.title, "SBR013 Title <script>alert('en')</script>", "EN translation is readable through private API");

    const editorResponse = await readResumeShell(config);
    assert.equal(editorResponse.statusCode, 200, "connected /admin/resume succeeds");
    assertResumeBootstrapShell(editorResponse.body, "connected /admin/resume");
    for (const action of LOCKED_ACTIONS) {
        assert.match(editorResponse.body, new RegExp(`data-locked-action="${action}"`, "i"), `${action} remains a locked affordance in the bootstrap shell`);
    }
    assertNoEnabledMutationControls(editorResponse.body);
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(contentRoot, { recursive: true });
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    const config = createBaseConfig({ contentRoot, auditRoot, publicAssetRoot });

    const missingApi = await readResumeApi(config);
    assert.ok(missingApi.statusCode >= 400, "missing Resume document API is non-2xx");
    const missingJson = JSON.parse(missingApi.body);
    assert.equal(missingJson.state, "degraded", "missing Resume document is degraded, not a crash");
    assert.equal(missingJson.writeEnabled, false, "missing document response keeps writeEnabled=false");
    assert.match(missingJson.reason, /missing|not found|future setup/i, "missing document response has human-readable reason");
    assert.equal(missingJson.document, undefined, "missing document API does not include document values");
    assert.doesNotMatch(missingApi.body, /translations|SBR013 Titolo|SBR013 Title/i, "missing document API exposes no translation values");

    const missingEditor = await readResumeShell(config);
    assert.equal(missingEditor.statusCode, 200, "missing Resume document still renders protected shell");
    assertResumeBootstrapShell(missingEditor.body, "missing Resume editor shell");
    assertNoEnabledMutationControls(missingEditor.body);
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    await fs.writeFile(path.join(contentRoot, "documents", "resume-main.json"), "{ \"title\": \"SBR013_SECRET_MALFORMED\",");
    const config = createBaseConfig({ contentRoot, auditRoot, publicAssetRoot });

    const malformedApi = await readResumeApi(config);
    assert.ok(malformedApi.statusCode >= 400, "malformed Resume document API is non-2xx");
    const malformedJson = JSON.parse(malformedApi.body);
    assert.equal(malformedJson.state, "blocked", "malformed JSON is blocked");
    assert.equal(malformedJson.writeEnabled, false, "malformed response keeps writeEnabled=false");
    assert.match(malformedJson.reason, /malformed|json|parse/i, "malformed response has human-readable reason");
    assert.equal(malformedJson.document, undefined, "malformed API does not include document values");
    assert.doesNotMatch(malformedApi.body, /SBR013_SECRET_MALFORMED/, "malformed API does not echo raw file content");

    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), ["SBR013_SECRET_ARRAY"]);
    const arrayApi = await readResumeApi(config);
    assert.ok(arrayApi.statusCode >= 400, "non-object Resume document API is non-2xx");
    const arrayJson = JSON.parse(arrayApi.body);
    assert.equal(arrayJson.state, "blocked", "non-object JSON is blocked");
    assert.equal(arrayJson.document, undefined, "non-object API does not include document values");
    assert.doesNotMatch(arrayApi.body, /SBR013_SECRET_ARRAY/, "non-object API does not echo array content");

    const unreadablePath = path.join(contentRoot, "documents", "resume-main.json");
    await writeJson(unreadablePath, completeResume());
    await fs.chmod(unreadablePath, 0o000);
    try {
        const unreadableApi = await readResumeApi(config);
        assert.ok(unreadableApi.statusCode >= 400, "unreadable Resume file API is non-2xx");
        const unreadableJson = JSON.parse(unreadableApi.body);
        assert.equal(unreadableJson.state, "blocked", "unreadable Resume file is blocked");
        assert.equal(unreadableJson.document, undefined, "unreadable Resume file exposes no document values");
        assert.doesNotMatch(unreadableApi.body, /\/tmp\/sbr-013-admin-|content\/documents/i, "unreadable Resume file response redacts filesystem paths");
    } finally {
        await fs.chmod(unreadablePath, 0o600);
    }

    const inaccessibleConfig = createBaseConfig({
        contentRoot: path.join(tempRoot, "missing-parent", "content"),
        auditRoot,
        publicAssetRoot
    });
    const inaccessibleApi = await readResumeApi(inaccessibleConfig);
    assert.ok(inaccessibleApi.statusCode >= 400, "inaccessible content root Resume API is non-2xx");
    const inaccessibleJson = JSON.parse(inaccessibleApi.body);
    assert.equal(inaccessibleJson.state, "blocked", "inaccessible content root is blocked");
    assert.equal(inaccessibleJson.document, undefined, "inaccessible content root exposes no document values");
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    const outsideRoot = path.join(tempRoot, "outside");
    await fs.mkdir(contentRoot, { recursive: true });
    await fs.mkdir(publicAssetRoot);
    await fs.mkdir(outsideRoot);
    await writeJson(path.join(outsideRoot, "resume-main.json"), completeResume({ id: "outside-secret" }));
    await fs.symlink(outsideRoot, path.join(contentRoot, "documents"));
    const config = createBaseConfig({
        contentRoot,
        auditRoot: path.join(tempRoot, "audit"),
        publicAssetRoot
    });

    const symlinkApi = await readResumeApi(config);
    assert.ok(symlinkApi.statusCode >= 400, "symlink escape Resume API is non-2xx");
    const symlinkJson = JSON.parse(symlinkApi.body);
    assert.equal(symlinkJson.state, "blocked", "symlink escape is blocked by path confinement");
    assert.match(symlinkJson.reason, /confinement|symlink/i, "symlink response names path confinement failure");
    assert.doesNotMatch(symlinkApi.body, /\/tmp\/sbr-013-admin-|content\/documents|outside/i, "symlink blocked API redacts filesystem path details");
    assertNoSecretValues(symlinkApi.body, "symlink blocked API");

    const symlinkEditor = await readResumeShell(config);
    assert.equal(symlinkEditor.statusCode, 200, "symlink escape still renders protected editor shell");
    assertResumeBootstrapShell(symlinkEditor.body, "symlink Resume editor shell");
    assert.doesNotMatch(symlinkEditor.body, /\/tmp\/sbr-013-admin-|content\/documents|outside/i, "symlink blocked editor redacts filesystem path details");
    assertNoSecretValues(symlinkEditor.body, "symlink blocked editor");
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    const config = createBaseConfig({ contentRoot, auditRoot, publicAssetRoot });

    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume({ id: "wrong-id" }));
    const wrongId = JSON.parse((await readResumeApi(config)).body);
    assert.equal(wrongId.state, "blocked", "wrong Resume singleton id is blocked");
    assert.match(JSON.stringify(wrongId.validation.reasons), /resume-main|id/i, "wrong id reason is deterministic");

    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume({ type: "blog" }));
    const wrongType = JSON.parse((await readResumeApi(config)).body);
    assert.equal(wrongType.state, "blocked", "wrong document type is blocked");
    assert.match(JSON.stringify(wrongType.validation.reasons), /type|resume/i, "wrong type reason is deterministic");

    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume({ status: "ready" }));
    const wrongStatus = JSON.parse((await readResumeApi(config)).body);
    assert.equal(wrongStatus.state, "blocked", "unsupported document status is blocked");
    assert.match(JSON.stringify(wrongStatus.validation.reasons), /status|draft|published|archived/i, "wrong status reason is deterministic");

    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume({ translations: { it: completeResume().translations.it } }));
    const missingEnResponse = await readResumeApi(config);
    const missingEn = JSON.parse(missingEnResponse.body);
    assert.equal(missingEn.state, "blocked", "missing EN translation is blocked");
    assert.match(JSON.stringify(missingEn.validation.reasons), /missing en translation|en/i, "missing language reason names EN");
    const missingEnEditor = await readResumeShell(config);
    assertResumeBootstrapShell(missingEnEditor.body, "missing language Resume editor shell");
    assertNoEnabledMutationControls(missingEnEditor.body);

    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume({
        translations: {
            ...completeResume().translations,
            it: {
                ...completeResume().translations.it,
                hero: { actions: [{ label: "Backslash Draft", href: "..\\drafts\\resume.md" }] }
            }
        }
    }));
    const unsafeBackslash = JSON.parse((await readResumeApi(config)).body);
    assert.equal(unsafeBackslash.state, "blocked", "backslash traversal references block Resume readiness");
    assert.match(JSON.stringify(unsafeBackslash.validation.reasons), /translations\.it\.hero\.actions\.0\.href/i, "backslash traversal reason includes deterministic field path");
    assert.doesNotMatch(JSON.stringify(unsafeBackslash.validation.reasons), /\.\.\\drafts\\resume\.md/i, "backslash traversal reason does not echo raw unsafe value");

    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume({
        translations: {
            ...completeResume().translations,
            it: {
                ...completeResume().translations.it,
                hero: { actions: [{ label: "Encoded Draft", href: "..%2fdrafts%2fresume.md" }] },
                panels: [{ title: "Encoded Script", externalUrl: "javascript%3aalert(1)" }]
            }
        }
    }));
    const unsafeEncoded = JSON.parse((await readResumeApi(config)).body);
    assert.equal(unsafeEncoded.state, "blocked", "percent-encoded unsafe references block Resume readiness");
    assert.match(JSON.stringify(unsafeEncoded.validation.reasons), /translations\.it\.hero\.actions\.0\.href|translations\.it\.panels\.0\.externalUrl/i, "percent-encoded unsafe reference reason includes deterministic field path");
    assert.doesNotMatch(JSON.stringify(unsafeEncoded.validation.reasons), /%2f|%3a|javascript/i, "percent-encoded unsafe reference reason does not echo raw unsafe value or scheme");

    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume({
        translations: {
            ...completeResume().translations,
            it: {
                ...completeResume().translations.it,
                hero: { actions: [{ label: "Private CV", href: "/var/lib/sbar-si/private/cv.pdf" }] },
                panels: [{ title: "Unsafe", externalUrl: "javascript:alert(1)" }],
                contacts: [{ label: "Draft", url: "../drafts/resume.md" }]
            }
        }
    }));
    const unsafe = JSON.parse((await readResumeApi(config)).body);
    assert.equal(unsafe.state, "blocked", "unsafe references block Resume readiness");
    assert.match(JSON.stringify(unsafe.validation.reasons), /unsafe reference/i, "unsafe reference reason is reported");
    assert.match(JSON.stringify(unsafe.validation.reasons), /translations\.it\.hero\.actions\.0\.href|translations\.it\.panels\.0\.externalUrl|translations\.it\.contacts\.0\.url/i, "unsafe reference reason includes a deterministic field path");
    assert.doesNotMatch(JSON.stringify(unsafe.validation.reasons), /\/var\/lib\/sbar-si\/private\/cv\.pdf|javascript:alert|\.\.\/drafts/i, "unsafe reference reasons do not echo raw unsafe path values");
});

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(path.join(contentRoot, "documents"), { recursive: true });
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);
    await writeJson(path.join(contentRoot, "documents", "resume-main.json"), completeResume({
        id: "resume-main",
        translations: {
            it: {
                title: "SBR013_BLOCKED_TITLE",
                summary: "SBR013_BLOCKED_SUMMARY",
                bodyMd: "SBR013_BLOCKED_BODY",
                contacts: [{ label: "blocked", href: "mailto:blocked@example.invalid" }]
            },
            en: {
                title: "SBR013_SECRET_EN_TITLE",
                summary: "SBR013_SECRET_EN_SUMMARY"
            }
        }
    }));
    const config = createBaseConfig({ contentRoot, auditRoot, publicAssetRoot });
    const blockedSessionConfig = createBaseConfig({
        contentRoot,
        auditRoot,
        publicAssetRoot,
        session: { id: "missing", token: "", headerName: "x-sbar-admin-session", createdAt: null }
    });

    for (const [label, blockedConfig, remoteAddress] of [
        ["non-loopback", config, "203.0.113.13"],
        ["blocked session", blockedSessionConfig, "127.0.0.1"]
    ]) {
        const blockedApi = await buildAdminResponse({ method: "GET", url: "/api/admin/documents/resume-main", remoteAddress, headers: { host: `127.0.0.1:${blockedConfig.port}` }, config: blockedConfig });
        assert.equal(blockedApi.statusCode, 403, `${label} Resume document API is blocked`);
        assert.match(blockedApi.body, /ssh -L|recovery|admin access blocked/i, `${label} Resume document API gives recovery hint`);
        assert.doesNotMatch(blockedApi.body, /document|validation|translations|data-field-path|content root|documents/i, `${label} Resume document API exposes no document or validation details`);
        assertNoSecretValues(blockedApi.body, `${label} blocked API`);

        const blockedEditor = await buildAdminResponse({ method: "GET", url: "/admin/resume", remoteAddress, config: blockedConfig });
        assert.equal(blockedEditor.statusCode, 403, `${label} /admin/resume is blocked`);
        assert.match(blockedEditor.body, /ssh\s+-L\s+8787:127\.0\.0\.1:8787/i, `${label} blocked editor gives SSH recovery hint`);
        assert.doesNotMatch(blockedEditor.body, /data-admin-editor|data-editor-language|data-field-path|data-validation-state|data-locked-action|data-editorial-area|data-count/i, `${label} blocked editor exposes no field/editor markers`);
        assertNoSecretValues(blockedEditor.body, `${label} blocked editor`);
    }
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
    assert.deepEqual(healthJson.actionsLocked, ADMIN_LOCKED_ACTIONS, "health locked actions are unchanged");
    assert.ok(Array.isArray(healthJson.guardrails), "health guardrail contract remains present");

    const editorial = await buildAdminResponse({ method: "GET", url: "/api/admin/editorial-summary", remoteAddress: "127.0.0.1", headers: validReadHeaders(config), config });
    const editorialJson = JSON.parse(editorial.body);
    assert.equal(editorial.statusCode, 200, "editorial summary API remains available with the private read header");
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
    assert.doesNotMatch(source, /\/admin\/resume|data-admin-editor|data-editor-entry|api\/admin\/documents\/resume-main|SBR013/i, `${publicFile} stays separated from private Resume document runtime`);
}
const publishedManifest = await fs.readFile("data/published.json", "utf8");
assert.doesNotMatch(publishedManifest, /SBR013|api\/admin\/documents\/resume-main|data-admin-editor/i, "published manifest is not wired to private Resume document API");

for (const packageFile of PACKAGE_FILES) {
    await assert.rejects(() => fs.access(packageFile), /ENOENT/, `${packageFile} was not introduced`);
}

console.log("SBR-013 private Resume document read model assertions passed");
