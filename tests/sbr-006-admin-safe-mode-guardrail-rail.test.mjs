import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    createAdminConfig,
    buildAdminResponse,
    startAdminServer
} from "../admin/server.js";
import { createAdminSession } from "../admin/session.js";
import { evaluateAdminRequestGuard } from "../admin/request-guard.js";
import { confinePath } from "../admin/path-confinement.js";
import { createAuditRecord } from "../admin/audit.js";

const LOCKED_ACTIONS = ["preview", "publish", "unpublish", "upload"];
const GUARDRAIL_KEYS = [
    "ssh-tunnel",
    "local-session",
    "request-guard",
    "content-store",
    "published-manifest",
    "path-confinement",
    "audit-log",
    "public-routing"
];

async function withTempDir(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sbr-006-admin-"));
    try {
        return await fn(root);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
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

function extractGuardrailStatuses(html) {
    const statuses = new Map();
    const pattern = /data-guardrail="([^"]+)"[^>]*data-status="([^"]+)"/g;
    let match;
    while ((match = pattern.exec(html))) {
        statuses.set(match[1], match[2]);
    }
    return statuses;
}

async function getText(baseUrl, pathname, options) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    return { response, text: await response.text() };
}

async function getJson(baseUrl, pathname, options) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    return { response, json: await response.json() };
}

await withTempDir(async (tempRoot) => {
    const contentRoot = path.join(tempRoot, "content");
    const auditRoot = path.join(tempRoot, "audit");
    const publicAssetRoot = path.join(tempRoot, "public-assets");
    await fs.mkdir(contentRoot);
    await fs.mkdir(auditRoot);
    await fs.mkdir(publicAssetRoot);

    const session = createAdminSession({ now: () => new Date("2026-05-29T07:00:00.000Z") });
    const config = createAdminConfig({
        host: "127.0.0.1",
        port: 0,
        contentRoot,
        auditRoot,
        publicAssetRoot,
        publishedManifestPath: path.resolve("data/published.json"),
        session
    });
    const running = await startAdminServer(config);
    const baseUrl = `http://${running.host}:${running.port}`;

    try {
        const { response, text } = await getText(baseUrl, "/admin");
        assert.equal(response.status, 200, "GET /admin succeeds through loopback");
        assert.match(text, /data-shell-nav="sections"/i, "private /admin reuses the shared shell nav");
        assert.match(text, /data-admin-overlay-shell/i, "private /admin renders overlay utility strip marker");
        assert.match(text, /admin mode \/ connected/i, "private /admin states connected admin mode");
        assert.match(text, /write enabled/i, "private /admin states writeEnabled=true for guarded draft save");
        assert.match(text, /private overlay/i, "private /admin remains visibly private");
        assert.doesNotMatch(text, /<button[^>]*>\s*(?:Save|Preview|Publish|Unpublish|Upload)\b/i, "no enabled-looking mutation buttons are rendered");
        assert.doesNotMatch(text, /data-action="(?:save|preview|publish|unpublish|upload)"/i, "no mutation action controls are rendered");

        const health = await getJson(baseUrl, "/api/admin/health");
        assert.equal(health.response.status, 200, "GET /api/admin/health succeeds through loopback");
        assert.equal(health.json.writeEnabled, true, "health JSON reports writeEnabled=true for guarded draft save");
        assert.deepEqual(health.json.actionsLocked, LOCKED_ACTIONS, "health JSON reports locked actions");
        assert.ok(Array.isArray(health.json.guardrails), "health JSON exposes guardrails array");
        const jsonStatuses = new Map(health.json.guardrails.map((item) => [item.key, item.status]));
        assert.deepEqual([...jsonStatuses.keys()].sort(), [...GUARDRAIL_KEYS_FIXTURE()].sort(), "health JSON contains all guardrail keys");
        assert.equal(jsonStatuses.get("ssh-tunnel"), "connected", "ssh tunnel guardrail is connected");
        assert.equal(jsonStatuses.get("local-session"), "connected", "local session guardrail is connected");
        assert.equal(jsonStatuses.get("request-guard"), "connected", "request guardrail is connected");
        assert.equal(jsonStatuses.get("content-store"), "connected", "content-store guardrail mirrors connected health");
        assert.equal(jsonStatuses.get("published-manifest"), "connected", "published-manifest guardrail mirrors connected health");
        assert.equal(jsonStatuses.get("path-confinement"), "connected", "path confinement guardrail is connected");
        assert.equal(jsonStatuses.get("audit-log"), "connected", "audit-log guardrail is connected");
        assert.equal(jsonStatuses.get("public-routing"), "unverified", "public routing guardrail defaults to unverified");
        assert.match(JSON.stringify(health.json), /production[^\n]*(?:\/admin|\/api\/admin)[^\n]*(?:deny|not-found|verification|required)/i, "health JSON explains unverified public routing");
        assert.doesNotMatch(JSON.stringify(health.json), new RegExp(session.token, "g"), "health JSON never exposes raw session token");

        const beforeContent = await listRelative(contentRoot);
        const beforeAudit = await listRelative(auditRoot);
        const beforePublicAssets = await listRelative(publicAssetRoot);
        const manifestBefore = await fs.readFile(path.resolve("data/published.json"), "utf8");
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            const writeAttempt = await fetch(`${baseUrl}/api/admin/documents/resume-main`, { method, body: "blocked" });
            assert.ok(!writeAttempt.ok, `${method} document endpoint returns non-2xx`);
            const payload = await writeAttempt.json();
            assert.equal(payload.writeEnabled, false, `${method} response keeps writeEnabled=false`);
        }
        assert.deepEqual(await listRelative(contentRoot), beforeContent, "mutation attempts do not change content root");
        assert.deepEqual(await listRelative(auditRoot), beforeAudit, "mutation attempts do not change audit root");
        assert.deepEqual(await listRelative(publicAssetRoot), beforePublicAssets, "mutation attempts do not change public asset root");
        assert.equal(await fs.readFile(path.resolve("data/published.json"), "utf8"), manifestBefore, "mutation attempts do not rewrite published manifest");
    } finally {
        await running.close();
    }
});

{
    const session = createAdminSession({ now: () => new Date("2026-05-29T07:00:00.000Z") });
    assert.equal(typeof session.token, "string", "session exposes token to server-side callers for tests/future guarded requests");
    assert.ok(session.token.length >= 43, "session token is non-guessable length");
    assert.notEqual(createAdminSession().token, createAdminSession().token, "session tokens are process-local random material");

    const allowed = evaluateAdminRequestGuard({
        method: "PUT",
        remoteAddress: "127.0.0.1",
        hostHeader: "127.0.0.1:8787",
        originHeader: "http://127.0.0.1:8787",
        contentType: "application/json; charset=utf-8",
        tokenHeader: session.token,
        expectedHost: "127.0.0.1:8787",
        expectedOrigin: "http://127.0.0.1:8787",
        session
    });
    assert.equal(allowed.allowed, true, "request guard allows a valid JSON mutation-shaped request");

    const blockedCases = [
        ["non-loopback-remote", { remoteAddress: "203.0.113.10" }],
        ["non-loopback-host", { hostHeader: "0.0.0.0:8787" }],
        ["host-mismatch", { hostHeader: "127.0.0.2:8787" }],
        ["origin-mismatch", { originHeader: "https://evil.example" }],
        ["session-token-missing", { tokenHeader: "" }],
        ["invalid-content-type", { contentType: "text/plain" }]
    ];

    for (const [reason, override] of blockedCases) {
        const decision = evaluateAdminRequestGuard({
            method: "PUT",
            remoteAddress: "127.0.0.1",
            hostHeader: "127.0.0.1:8787",
            originHeader: "http://127.0.0.1:8787",
            contentType: "application/json",
            tokenHeader: session.token,
            expectedHost: "127.0.0.1:8787",
            expectedOrigin: "http://127.0.0.1:8787",
            session,
            ...override
        });
        assert.equal(decision.allowed, false, `${reason} blocks the request`);
        assert.ok(decision.reasons.some((item) => item.code === reason), `${reason} is exposed as a structured reason`);
    }
}

await withTempDir(async (tempRoot) => {
    const privateRoot = path.join(tempRoot, "private");
    const publicRoot = path.join(tempRoot, "public");
    const outsideRoot = path.join(tempRoot, "outside");
    await fs.mkdir(privateRoot);
    await fs.mkdir(publicRoot);
    await fs.mkdir(outsideRoot);

    const confined = await confinePath({
        root: privateRoot,
        candidate: "drafts/resume.json",
        publicRoots: [publicRoot]
    });
    assert.equal(confined, path.join(privateRoot, "drafts", "resume.json"), "relative path is confined under private root");

    await assert.rejects(
        () => confinePath({ root: privateRoot, candidate: "../escape.json", publicRoots: [publicRoot] }),
        /traversal|outside|confined/i,
        ".. traversal is rejected"
    );
    await assert.rejects(
        () => confinePath({ root: privateRoot, candidate: path.join(outsideRoot, "escape.json"), publicRoots: [publicRoot] }),
        /outside|confined/i,
        "absolute path outside root is rejected"
    );
    await assert.rejects(
        () => confinePath({ root: privateRoot, candidate: path.join(publicRoot, "published.json"), publicRoots: [publicRoot] }),
        /public|outside|confined/i,
        "private-to-public root crossover is rejected"
    );

    const symlinkPath = path.join(privateRoot, "link-out");
    await fs.symlink(outsideRoot, symlinkPath);
    await assert.rejects(
        () => confinePath({ root: privateRoot, candidate: "link-out/escape.json", publicRoots: [publicRoot] }),
        /symlink|outside|confined/i,
        "symlink escape is rejected"
    );
});

{
    const record = createAuditRecord({
        timestamp: "2026-05-29T07:00:00.000Z",
        action: "publish",
        result: "blocked",
        target: { id: "resume-main", path: "/var/lib/sbar-si/content/resume-main.json" },
        reasons: [{ code: "session-token-missing", detail: "missing token SECRET_TOKEN" }],
        request: {
            headers: {
                authorization: "Bearer SECRET_TOKEN",
                "x-admin-session": "SECRET_TOKEN"
            },
            body: "raw request body SECRET_TOKEN",
            bodyMd: "# markdown SECRET_TOKEN",
            fileBytes: Buffer.from("SECRET_TOKEN")
        }
    });
    assert.equal(record.timestamp, "2026-05-29T07:00:00.000Z", "audit record keeps timestamp");
    assert.equal(record.action, "publish", "audit record keeps action");
    assert.equal(record.result, "blocked", "audit record keeps result");
    assert.equal(record.target.id, "resume-main", "audit record keeps target id");
    assert.ok(record.reasons.some((item) => item.code === "session-token-missing"), "audit record keeps redacted reason code");
    const serialized = JSON.stringify(record);
    assert.doesNotMatch(serialized, /SECRET_TOKEN|authorization|raw request body|markdown|fileBytes/i, "audit record excludes secrets, auth headers, bodies, markdown, and file bytes");
}

await withTempDir(async (tempRoot) => {
    const config = createAdminConfig({
        contentRoot: path.join(tempRoot, "content"),
        auditRoot: path.join(tempRoot, "audit"),
        publicAssetRoot: path.join(tempRoot, "public-assets"),
        publishedManifestPath: path.resolve("data/published.json")
    });
    const blocked = await buildAdminResponse({
        method: "GET",
        url: "/admin",
        remoteAddress: "203.0.113.10",
        config
    });
    assert.equal(blocked.statusCode, 403, "non-loopback admin request is blocked");
    assert.match(blocked.body, /blocked|ssh tunnel|loopback/i, "blocked response explains access failure");
    assert.match(blocked.body, /ssh\s+-L\s+8787:127\.0\.0\.1:8787/i, "blocked response gives SSH tunnel recovery hint");
    assert.doesNotMatch(blocked.body, /data-guardrail=|data-health="content-store"|data-health="published-manifest"|content root|published manifest|data-editorial-area|data-count=|document summaries/i, "blocked response exposes no connected rail, editorial data, or raw diagnostics");
});

{
    const css = await fs.readFile("admin/public/admin.css", "utf8");
    assert.match(css, /guardrail-card\[data-status="connected"\][\s\S]*var\(--success-500\)/, "connected guardrails use success-500");
    assert.match(css, /guardrail-card\[data-status="(?:locked|unverified)"\][\s\S]*var\(--warning-500\)/, "locked/unverified guardrails use warning-500");
    assert.match(css, /guardrail-card\[data-status="blocked"\][\s\S]*var\(--danger-500\)/, "blocked guardrails use danger-500");
    assert.match(css, /var\(--secondary-500\)/, "admin CSS keeps secondary-500 for system context");
    assert.match(css, /var\(--font-body\)/, "admin explanatory copy uses font-body token");
    assert.match(css, /var\(--font-mono\)/, "admin diagnostics use font-mono token");
    assert.doesNotMatch(css, /guardrail-card\[data-status="(?:connected|locked|unverified|blocked)"\][\s\S]{0,160}var\(--primary-600\)/, "primary-600 is not used as a generic guardrail status color");
}

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
        assert.doesNotMatch(source, /admin guardrail|data-guardrail|api\/admin|admin\/server|Admin Session Gate/i, `${publicFile} does not import or render admin guardrails`);
    }
    const indexHtml = await fs.readFile("index.html", "utf8");
    assert.match(indexHtml, /#\/resume/, "public Resume route remains present");
    assert.match(indexHtml, /#\/blog/, "public Blog route remains present");
    assert.match(indexHtml, /#\/resources/, "public Resources route remains present");
}

{
    const packageFiles = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "deno.json", "bun.lockb"];
    for (const packageFile of packageFiles) {
        await assert.rejects(() => fs.access(packageFile), /ENOENT/, `${packageFile} is not introduced by SBR-006`);
    }
}

function GUARDRAIL_KEYS_FIXTURE() {
    return GUARDRAIL_KEYS;
}

console.log("SBR-006 admin safe-mode guardrail rail assertions passed");
