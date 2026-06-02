import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { ADMIN_LOCKED_ACTIONS, evaluateAdminHealth, isLoopbackHost } from "./health.js";
import { evaluateEditorialSummary } from "./content-store.js";
import { evaluateResumeDocumentReadModel } from "./resume-document.js";
import { renderResumeEditorBootstrapShellBody } from "./resume-editor.js";
import { ADMIN_SESSION_HEADER, getDefaultAdminSession } from "./session.js";
import { evaluateAdminMutationPreflight } from "./mutation-preflight.js";
import { getAdminJsonMaxBytes, readAdminRequestBody } from "./body-intake.js";
import { createResumeSaveBodyFailure, handleResumeDraftSave } from "./resume-save.js";
import { evaluateAdminPrivateReadGuard, expectedAdminHost } from "./request-guard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_CONTENT_ROOT = "/var/lib/sbar-si/content";
const DEFAULT_AUDIT_ROOT = "/var/lib/sbar-si/audit";
const DEFAULT_PUBLIC_ASSET_ROOT = "/var/www/sbar.si/uploads";
const DEFAULT_MANIFEST_PATH = path.resolve("data/published.json");
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_STATIC_FILE_MAP = new Map([
    ["/styles.css", "styles.css"],
    ["/config.js", "config.js"],
    ["/script.js", "script.js"]
]);
const PUBLIC_STATIC_PREFIXES = [
    { prefix: "/styles/", relativeRoot: "styles" },
    { prefix: "/app/", relativeRoot: "app" },
    { prefix: "/files/", relativeRoot: "files" }
];

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalizePort(value) {
    const port = Number(value);

    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid admin port: ${value}`);
    }

    return port;
}

function normalizePublicRoutingVerified(value) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        return value === "1" || value.toLowerCase() === "true";
    }

    return false;
}

export function createAdminConfig(options = {}) {
    const host = options.host || process.env.SBAR_ADMIN_HOST || DEFAULT_HOST;
    const port = normalizePort(options.port ?? process.env.SBAR_ADMIN_PORT ?? DEFAULT_PORT);
    const contentRoot = path.resolve(options.contentRoot || process.env.SBAR_ADMIN_CONTENT_ROOT || DEFAULT_CONTENT_ROOT);
    const auditRoot = path.resolve(options.auditRoot || process.env.SBAR_ADMIN_AUDIT_ROOT || DEFAULT_AUDIT_ROOT);
    const publicAssetRoot = path.resolve(options.publicAssetRoot || process.env.SBAR_ADMIN_PUBLIC_ASSET_ROOT || DEFAULT_PUBLIC_ASSET_ROOT);
    const publishedManifestPath = path.resolve(
        options.publishedManifestPath || process.env.SBAR_ADMIN_PUBLISHED_MANIFEST || DEFAULT_MANIFEST_PATH
    );
    const publicRoutingVerified = normalizePublicRoutingVerified(
        options.publicRoutingVerified ?? process.env.SBAR_ADMIN_PUBLIC_ROUTING_VERIFIED
    );
    const session = options.session || getDefaultAdminSession();

    return {
        host,
        port,
        contentRoot,
        auditRoot,
        publicAssetRoot,
        publishedManifestPath,
        publicRoutingVerified,
        session,
        jsonBodyMaxBytes: options.jsonBodyMaxBytes ?? process.env.SBAR_ADMIN_JSON_MAX_BYTES
    };
}

function assertLoopbackBindHost(host) {
    if (!isLoopbackHost(host)) {
        throw new Error(`Refusing to start admin service on non-loopback host "${host}". Use 127.0.0.1 and SSH forwarding.`);
    }
}

function response(statusCode, body, headers = {}) {
    const nextHeaders = {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        ...headers
    };
    const contentType = String(nextHeaders["content-type"] || "").toLowerCase();

    if (contentType.startsWith("text/html")) {
        nextHeaders["content-security-policy"] = nextHeaders["content-security-policy"] || "frame-ancestors 'none'";
        nextHeaders["x-frame-options"] = nextHeaders["x-frame-options"] || "DENY";
    }

    return {
        statusCode,
        headers: nextHeaders,
        body
    };
}

function publicStaticContentType(pathname) {
    if (pathname.endsWith(".css")) {
        return "text/css; charset=utf-8";
    }

    if (pathname.endsWith(".js")) {
        return "text/javascript; charset=utf-8";
    }

    if (pathname.endsWith(".json")) {
        return "application/json; charset=utf-8";
    }

    if (pathname.endsWith(".txt")) {
        return "text/plain; charset=utf-8";
    }

    if (pathname.endsWith(".pdf")) {
        return "application/pdf";
    }

    if (pathname.endsWith(".html")) {
        return "text/html; charset=utf-8";
    }

    return "application/octet-stream";
}

function resolvePublicStaticPath(pathname) {
    if (PUBLIC_STATIC_FILE_MAP.has(pathname)) {
        return path.resolve(REPO_ROOT, PUBLIC_STATIC_FILE_MAP.get(pathname));
    }

    for (const entry of PUBLIC_STATIC_PREFIXES) {
        if (!pathname.startsWith(entry.prefix)) {
            continue;
        }

        const relativePath = pathname.slice(1);
        const resolved = path.resolve(REPO_ROOT, relativePath);
        const allowedRoot = path.resolve(REPO_ROOT, entry.relativeRoot);

        if (resolved === allowedRoot || resolved.startsWith(`${allowedRoot}${path.sep}`)) {
            return resolved;
        }

        return null;
    }

    return null;
}

async function readPublicStaticAsset(pathname, config) {
    if (pathname === "/data/published.json") {
        return {
            body: await fs.readFile(config.publishedManifestPath),
            contentType: "application/json; charset=utf-8"
        };
    }

    const resolvedPath = resolvePublicStaticPath(pathname);

    if (!resolvedPath) {
        return null;
    }

    return {
        body: await fs.readFile(resolvedPath),
        contentType: publicStaticContentType(pathname)
    };
}

function renderPrivateOverlayHead(config, options = {}) {
    const meta = ['<meta name="admin-shell-mode" content="overlay">'];

    if (options.includeSession !== false && config && config.session && config.session.headerName) {
        meta.push(`<meta name="admin-session-header" content="${escapeHtml(config.session.headerName)}">`);
    }

    if (options.includeSession !== false && config && config.session && config.session.token) {
        meta.push(`<meta name="admin-session-token" content="${escapeHtml(config.session.token)}">`);
    }

    if (options.includeEndpoints !== false) {
        meta.push('<meta name="admin-health-endpoint" content="/api/admin/health">');
        meta.push('<meta name="admin-editorial-summary-endpoint" content="/api/admin/editorial-summary">');
        meta.push('<meta name="admin-resume-document-endpoint" content="/api/admin/documents/resume-main">');
    }

    meta.push('<link rel="stylesheet" href="/admin/overlay.css">');

    return meta.join("\n    ");
}

function renderAdminOverlayBootstrap(options = {}) {
    const overlayState = options.overlayState || (options.blocked ? "blocked" : "loading");
    const writeEnabled = Boolean(options.writeEnabled);
    const modeLabel = overlayState === "connected"
        ? "admin mode / connected"
        : overlayState === "blocked"
            ? "admin mode / blocked"
            : "admin mode / locked";
    const writeLabel = overlayState === "connected"
        ? (writeEnabled ? "write enabled" : "write locked")
        : "write state / locked";
    const draftLabel = overlayState === "blocked" ? "draft view / hidden" : "draft view / loading";
    const diagnosticsText = overlayState === "blocked"
        ? "Diagnostics blocked until the protected admin overlay is connected. No host data was exposed. Recovery: ssh -L 8787:127.0.0.1:8787 <server-user>@sbar.si."
        : "Diagnostics unavailable in this slice. The panel shell is in place, but no host command output is exposed yet.";
    const eyebrow = overlayState === "connected"
        ? "private overlay / connected"
        : overlayState === "blocked"
            ? "private overlay / blocked"
            : "private overlay / bootstrap";

    return `
        <section class="admin-overlay-strip" data-admin-overlay-shell data-overlay-state="${overlayState}" data-write-enabled="${writeEnabled ? "true" : "false"}" aria-label="Admin utility strip">
            <p class="admin-overlay-eyebrow">${escapeHtml(eyebrow)}</p>
            <div class="admin-overlay-pills">
                <p class="admin-overlay-pill" data-admin-pill="mode">${escapeHtml(modeLabel)}</p>
                <p class="admin-overlay-pill" data-admin-pill="write">${escapeHtml(writeLabel)}</p>
                <p class="admin-overlay-pill" data-admin-pill="draft" data-draft-visible="false">${escapeHtml(draftLabel)}</p>
                <button class="admin-overlay-pill admin-overlay-pill--button" type="button" data-admin-diagnostics-toggle aria-expanded="false" aria-controls="admin-diagnostics-panel">Diagnostics</button>
            </div>
        </section>
        <section class="admin-diagnostics-panel" id="admin-diagnostics-panel" data-admin-diagnostics-panel data-panel-state="closed" hidden aria-hidden="true">
            <div class="admin-diagnostics-panel__inner">
                <div class="admin-diagnostics-panel__header">
                    <p class="admin-overlay-eyebrow">diagnostics / ${overlayState === "blocked" ? "blocked" : "unavailable"}</p>
                    <button class="admin-diagnostics-close" type="button" data-admin-diagnostics-close aria-label="Close Diagnostics">Close</button>
                </div>
                <h2 class="admin-diagnostics-title">Diagnostics</h2>
                <p class="admin-diagnostics-copy" data-admin-diagnostics-copy>${escapeHtml(diagnosticsText)}</p>
            </div>
        </section>
    `;
}

async function readPublicIndexHtml() {
    return fs.readFile(path.join(REPO_ROOT, "index.html"), "utf8");
}

async function renderAdminOverlayShell(config, options = {}) {
    const template = await readPublicIndexHtml();
    const bootstrap = renderAdminOverlayBootstrap(options);
    const includePrivateBootstrap = (options.overlayState || (options.blocked ? "blocked" : "loading")) === "connected";
    const extraHead = renderPrivateOverlayHead(config, {
        includeSession: includePrivateBootstrap,
        includeEndpoints: includePrivateBootstrap
    });
    const extraBody = '<script type="module" src="/admin/overlay.js"></script>';

    return template
        .replace('<html lang="it">', '<html lang="it" data-admin="true">')
        .replace('<body data-current-section="home">', '<body data-current-section="home" data-admin="true">')
        .replace('</head>', `    ${extraHead}\n</head>`)
        .replace(
            '<main id="resume-app" class="resume-grid" data-current-section="home" aria-live="polite"></main>',
            `${bootstrap}\n\n        <main id="resume-app" class="resume-grid" data-current-section="home" aria-live="polite"></main>`
        )
        .replace('</body>', `    ${extraBody}\n</body>`);
}

function renderGuardrailCard(item) {
    const healthAttribute = ["ssh-tunnel", "content-store", "published-manifest"].includes(item.key)
        ? ` data-health="${escapeHtml(item.key)}"`
        : "";
    const locks = Array.isArray(item.locks) && item.locks.length
        ? `<p class="guardrail-locks">locks: ${item.locks.map(escapeHtml).join(", ")}</p>`
        : "";

    return `
        <article class="guardrail-card health-card" data-guardrail="${escapeHtml(item.key)}"${healthAttribute} data-status="${escapeHtml(item.status)}">
            <span class="health-label guardrail-label">${escapeHtml(item.label)}</span>
            <strong class="health-state guardrail-state">${escapeHtml(item.status)}</strong>
            <p>${escapeHtml(item.detail)}</p>
            ${locks}
        </article>
    `;
}

function renderPageShell({ title, body, blocked = false, extraHead = "", extraBody = "" }) {
    return `<!DOCTYPE html>
<html lang="en" data-admin="true">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark">
    <title>${escapeHtml(title)} | sbar.si admin</title>
    <style>
        :root { --bg-950: #000000; --surface-900: #030604; --surface-850: #050b07; --surface-800: #08120b; --primary-600: #b7ffc4; --secondary-500: #8ff7ff; --success-500: #7dff9a; --warning-500: #f5c542; --danger-500: #ff6b6b; --text-50: #f4fff3; --text-300: rgba(244,255,243,.78); --text-500: rgba(244,255,243,.64); --line-subtle: rgba(244,255,243,.16); --line-strong: rgba(244,255,243,.34); --font-display: "VT323", "Courier New", monospace; --font-body: "IBM Plex Sans", "Atkinson Hyperlegible", system-ui, sans-serif; --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Consolas, monospace; --radius-none: 0; --radius-control: 2px; --radius-card: 4px; --admin-shell-max: 1280px; --touch-target-min: 44px; --motion-base: 280ms; }
    </style>
    <link rel="stylesheet" href="/admin/admin.css">
    ${extraHead}
</head>
<body>
    <main class="admin-shell" data-admin-dashboard="${blocked ? "blocked" : "private"}">
        ${body}
    </main>
    ${extraBody}
</body>
</html>`;
}

function renderBlockedDashboard(health) {
    const body = `
        <section class="admin-hero is-blocked" data-status="blocked">
            <p class="eyebrow">admin tunnel gate</p>
            <h1>sbar.si admin blocked</h1>
            <p>This private admin surface only renders through a loopback SSH tunnel. No partial dashboard, guardrail rail, health diagnostics, or editorial data was exposed.</p>
            <p class="mono">ssh tunnel: ${escapeHtml(health.health.sshTunnel.status)} / ${escapeHtml(health.health.sshTunnel.detail)}</p>
            <p class="mono">recovery: ssh -L 8787:127.0.0.1:8787 &lt;server-user&gt;@sbar.si</p>
        </section>
    `;

    return renderPageShell({ title: "blocked", body, blocked: true });
}

function renderSafeModeSummary(health) {
    const saveEnabled = Boolean(health.writeEnabled);

    return `
        <section class="admin-note safe-mode-note" data-mode="safe-mode" data-write-enabled="${saveEnabled ? "true" : "false"}">
            <p class="eyebrow">safe mode / ${saveEnabled ? "save draft enabled" : "save draft unavailable"}</p>
            <h2>writeEnabled: ${saveEnabled ? "true" : "false"}</h2>
            <p>${escapeHtml(saveEnabled
                ? "Protected draft save is enabled for the private Resume path only. Preview, publish, unpublish, and upload remain locked until their guardrails are complete."
                : "Protected draft save is currently unavailable because one or more required guardrails are not connected. Resume inspection remains private, while preview, publish, unpublish, and upload stay locked.")}</p>
            <p>${escapeHtml(saveEnabled
                ? "This slice keeps the public site unchanged: Save draft writes only to the private content root, never publishes implicitly, and still requires the loopback/session/request guard chain."
                : "The public site remains unchanged. Restore the missing guardrail state before advertising or relying on draft save capability.")}</p>
            <ul class="locked-actions" aria-label="Locked future actions">
                ${health.actionsLocked.map((action) => `<li>${escapeHtml(action)} locked</li>`).join("")}
            </ul>
        </section>
    `;
}

function renderDiagnostics(health) {
    return `
        <section class="admin-note diagnostics-note" data-mode="diagnostics">
            <h2>diagnostics</h2>
            <dl>
                <div><dt>bind</dt><dd>${escapeHtml(health.bindHost)}:${escapeHtml(health.port)}</dd></div>
                <div><dt>content root</dt><dd>${escapeHtml(health.contentRoot)}</dd></div>
                <div><dt>audit root</dt><dd>${escapeHtml(health.auditRoot)}</dd></div>
                <div><dt>public assets</dt><dd>${escapeHtml(health.publicAssetRoot)}</dd></div>
                <div><dt>published manifest</dt><dd>${escapeHtml(health.publishedManifestPath)}</dd></div>
            </dl>
        </section>
    `;
}

function renderEditorialCount(key, value) {
    return `
        <div class="editorial-count" data-count="${escapeHtml(key)}" aria-label="${escapeHtml(key)} count">
            <span>${escapeHtml(key)}</span>
            <strong data-count="${escapeHtml(key)}">${escapeHtml(value)}</strong>
        </div>
    `;
}

function renderEditorEntry(area, health) {
    if (area.key !== "resume") {
        return "";
    }

    const saveEnabled = Boolean(health && health.writeEnabled);

    return `
        <a class="editor-entry" href="/admin/resume" data-editor-entry="resume" aria-label="Open Resume editor — ${saveEnabled ? "draft save enabled" : "draft save unavailable"}">
            <span>Open Resume editor</span>
            <small>${escapeHtml(saveEnabled ? "draft save enabled / preview locked" : "draft save unavailable / preview locked")}</small>
        </a>
    `;
}

function renderEditorialArea(area, health) {
    return `
        <article class="editorial-area" data-editorial-area="${escapeHtml(area.key)}">
            <h3>${escapeHtml(area.label)}</h3>
            <div class="editorial-counts" aria-label="${escapeHtml(area.label)} status counts">
                ${Object.entries(area.counts).map(([key, value]) => renderEditorialCount(key, value)).join("")}
            </div>
            ${renderEditorEntry(area, health)}
        </article>
    `;
}

function renderEditorialDiagnostics(diagnostics) {
    if (!Array.isArray(diagnostics) || !diagnostics.length) {
        return "";
    }

    return `
        <ul class="editorial-diagnostics" aria-label="Editorial blocking reasons">
            ${diagnostics.map((item) => `
                <li data-diagnostic="${escapeHtml(item.code)}" data-level="${escapeHtml(item.level)}">
                    <strong>${escapeHtml(item.level)}</strong>
                    <span>${escapeHtml(item.detail)}</span>
                </li>
            `).join("")}
        </ul>
    `;
}

function renderEditorialOverview(summary, health) {
    if (!summary) {
        return "";
    }

    const renderAreaCards = summary.status !== "blocked";
    const saveEnabled = Boolean(health && health.writeEnabled);

    return `
        <section class="admin-note editorial-overview" data-editorial-overview="${escapeHtml(summary.status)}" aria-labelledby="editorial-overview-title">
            <p class="eyebrow">private editorial overview</p>
            <h2 id="editorial-overview-title">Resume / Blog / Resources readiness</h2>
            <p>${escapeHtml(summary.detail)}. ${escapeHtml(saveEnabled
                ? "Resume draft save is available through the protected editor; preview, publish, unpublish, and upload remain locked."
                : "Resume draft save is unavailable until the missing guardrails are restored; preview, publish, unpublish, and upload remain locked.")}</p>
            ${renderAreaCards ? `
                <div class="editorial-grid" aria-label="Editorial status counts">
                    ${summary.areas.map((area) => renderEditorialArea(area, health)).join("")}
                </div>
            ` : ""}
            ${renderEditorialDiagnostics(summary.diagnostics)}
        </section>
    `;
}

function renderEditorialOverviewBootstrap() {
    return `
        <section class="admin-note editorial-overview editorial-overview-bootstrap" data-admin-bootstrap="dashboard" data-bootstrap-state="loading" aria-labelledby="editorial-overview-title">
            <p class="eyebrow">private editorial overview / bootstrap</p>
            <h2 id="editorial-overview-title">Resume / Blog / Resources readiness</h2>
            <p data-bootstrap-message>Loading protected editorial summary…</p>
        </section>
    `;
}

function renderPrivateBootstrapHead(config, extraMeta = []) {
    const meta = [];

    if (config && config.session && config.session.headerName) {
        meta.push(`<meta name="admin-session-header" content="${escapeHtml(config.session.headerName)}">`);
    }

    if (config && config.session && config.session.token) {
        meta.push(`<meta name="admin-session-token" content="${escapeHtml(config.session.token)}">`);
    }

    meta.push('<meta name="admin-health-endpoint" content="/api/admin/health">');
    meta.push('<meta name="admin-editorial-summary-endpoint" content="/api/admin/editorial-summary">');
    meta.push('<meta name="admin-resume-document-endpoint" content="/api/admin/documents/resume-main">');
    meta.push('<meta name="resume-save-endpoint" content="/api/admin/documents/resume-main">');

    for (const item of extraMeta) {
        if (typeof item === "string" && item) {
            meta.push(item);
        }
    }

    return meta.join("\n    ");
}

export function renderAdminDashboard(health, config = {}) {
    if (health.health.sshTunnel.status !== "connected") {
        return renderBlockedDashboard(health);
    }

    const saveEnabled = Boolean(health.writeEnabled);
    const body = `
        <section class="admin-hero">
            <p class="eyebrow">ssh tunnel / private loopback</p>
            <h1>sbar.si admin — guarded draft save</h1>
            <p>${escapeHtml(saveEnabled
                ? "Private admin foundation for Alessandro. Save draft is now enabled for Resume through the protected loopback/session/request path, while preview, publish, unpublish, and upload remain intentionally locked."
                : "Private admin foundation for Alessandro. Resume inspection remains available, but draft save is temporarily unavailable until the required loopback/session/request/content/audit guardrails are all connected.")}</p>
        </section>

        ${renderSafeModeSummary(health)}

        <section class="guardrail-grid health-grid" aria-label="Admin guardrails">
            ${health.guardrails.map(renderGuardrailCard).join("")}
        </section>

        ${renderEditorialOverviewBootstrap()}

        ${renderDiagnostics(health)}
    `;

    return renderPageShell({
        title: "guarded draft save",
        body,
        extraHead: renderPrivateBootstrapHead(config),
        extraBody: `<script type="module" src="/admin/admin.js"></script>`
    });
}

function jsonResponse(statusCode, payload) {
    return response(statusCode, `${JSON.stringify(payload, null, 2)}\n`, {
        "content-type": "application/json; charset=utf-8"
    });
}

async function readAdminCss() {
    return fs.readFile(path.join(__dirname, "public", "admin.css"), "utf8");
}

async function readAdminJs() {
    return fs.readFile(path.join(__dirname, "public", "admin.js"), "utf8");
}

async function readAdminOverlayCss() {
    return fs.readFile(path.join(__dirname, "public", "overlay.css"), "utf8");
}

async function readAdminOverlayJs() {
    return fs.readFile(path.join(__dirname, "public", "overlay.js"), "utf8");
}

function blockedHealthResponse(health) {
    return {
        service: health.service,
        safeMode: true,
        writeEnabled: false,
        actionsLocked: [...(health.actionsLocked || ADMIN_LOCKED_ACTIONS)],
        error: "admin access blocked",
        recovery: "ssh -L 8787:127.0.0.1:8787 <server-user>@sbar.si",
        health: {
            sshTunnel: health.health.sshTunnel
        },
        guardrails: [health.health.sshTunnel]
    };
}

function requestHeaderValue(headers = {}, name) {
    const target = String(name || "").toLowerCase();

    for (const [key, value] of Object.entries(headers || {})) {
        if (String(key).toLowerCase() !== target) {
            continue;
        }

        if (Array.isArray(value)) {
            return value[0] || "";
        }

        return value || "";
    }

    return "";
}

function safeGuardDecision(decision) {
    return {
        allowed: decision.allowed,
        method: decision.method,
        checks: decision.checks,
        reasons: decision.reasons.map((item) => ({
            code: item.code,
            detail: item.detail
        }))
    };
}

function privateReadBlockedResponse(health, decision) {
    return {
        service: health.service,
        safeMode: true,
        writeEnabled: false,
        actionsLocked: [...(health.actionsLocked || ADMIN_LOCKED_ACTIONS)],
        error: "admin private read blocked",
        message: "Private admin read blocked before draft data was exposed.",
        detail: "The private admin read requires the active local session header and exact loopback admin host. No draft data was exposed.",
        privateRead: safeGuardDecision(decision)
    };
}

function hasPrivateReadAccess(health) {
    const statuses = new Map((health.guardrails || []).map((item) => [item.key, item.status]));

    return ["ssh-tunnel", "local-session", "request-guard"].every((key) => statuses.get(key) === "connected");
}

function editorialSummaryResponse(health, editorialSummary) {
    return {
        service: health.service,
        safeMode: true,
        writeEnabled: false,
        actionsLocked: [...ADMIN_LOCKED_ACTIONS],
        editorial: editorialSummary
    };
}

function resumeDocumentResponse(health, readModel) {
    const payload = {
        service: health.service,
        safeMode: true,
        writeEnabled: false,
        actionsLocked: [...ADMIN_LOCKED_ACTIONS],
        state: readModel.state,
        reason: readModel.reason,
        validation: readModel.validation
    };

    if (readModel.readiness) {
        payload.readiness = readModel.readiness;
    }

    if (readModel.document) {
        payload.document = readModel.document;
    }

    return payload;
}

function renderResumeEditorBody(config, health) {
    return renderPageShell({
        title: "resume editor",
        body: renderResumeEditorBootstrapShellBody({ actionsLocked: health.actionsLocked }),
        extraHead: renderPrivateBootstrapHead(config),
        extraBody: `<script type="module" src="/admin/admin.js"></script>`
    });
}

export async function buildAdminResponse({ method = "GET", url = "/admin", remoteAddress = "127.0.0.1", headers = {}, body, config, skipMutationPreflight = false }) {
    const nextConfig = config || createAdminConfig({});
    assertLoopbackBindHost(nextConfig.host);

    const requestUrl = new URL(url, "http://127.0.0.1");
    const pathname = requestUrl.pathname.replace(/\/+$/, "") || "/";
    const sessionHeaderName = nextConfig && nextConfig.session && nextConfig.session.headerName
        ? nextConfig.session.headerName
        : ADMIN_SESSION_HEADER;
    const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/api/admin" || pathname.startsWith("/api/admin/");
    const mutationPreflight = skipMutationPreflight
        ? null
        : evaluateAdminMutationPreflight({
            method,
            pathname,
            remoteAddress,
            headers,
            config: nextConfig
        });

    if (mutationPreflight && mutationPreflight.kind !== "allowed") {
        return jsonResponse(mutationPreflight.statusCode, mutationPreflight.payload);
    }

    if (pathname === "/api/admin/documents/resume-main" && method === "PUT") {
        const saveResult = await handleResumeDraftSave({
            config: nextConfig,
            body
        });
        return jsonResponse(saveResult.statusCode, saveResult.payload);
    }

    if (isAdminPath && MUTATION_METHODS.has(method)) {
        return jsonResponse(405, {
            error: "method not allowed",
            safeMode: true,
            writeEnabled: false,
            actionsLocked: [...ADMIN_LOCKED_ACTIONS]
        });
    }

    if (method !== "GET") {
        return jsonResponse(405, { error: "method not allowed", safeMode: true, writeEnabled: false, actionsLocked: [...ADMIN_LOCKED_ACTIONS] });
    }

    if (pathname === "/admin/admin.css") {
        return response(200, await readAdminCss(), { "content-type": "text/css; charset=utf-8" });
    }

    if (pathname === "/admin/admin.js") {
        return response(200, await readAdminJs(), { "content-type": "text/javascript; charset=utf-8" });
    }

    if (pathname === "/admin/overlay.css") {
        return response(200, await readAdminOverlayCss(), { "content-type": "text/css; charset=utf-8" });
    }

    if (pathname === "/admin/overlay.js") {
        return response(200, await readAdminOverlayJs(), { "content-type": "text/javascript; charset=utf-8" });
    }

    const publicStaticAsset = await readPublicStaticAsset(pathname, nextConfig).catch((error) => {
        if (error && error.code === "ENOENT") {
            return null;
        }

        throw error;
    });

    if (publicStaticAsset) {
        return response(200, publicStaticAsset.body, { "content-type": publicStaticAsset.contentType });
    }

    if (pathname === "/api/admin/health") {
        const health = await evaluateAdminHealth({ remoteAddress, config: nextConfig });
        return jsonResponse(
            health.health.sshTunnel.status === "connected" ? 200 : 403,
            health.health.sshTunnel.status === "connected" ? health : blockedHealthResponse(health)
        );
    }

    if (pathname === "/api/admin/editorial-summary") {
        const health = await evaluateAdminHealth({ remoteAddress, config: nextConfig });

        if (!hasPrivateReadAccess(health)) {
            return jsonResponse(403, blockedHealthResponse(health));
        }

        const readDecision = evaluateAdminPrivateReadGuard({
            method,
            remoteAddress,
            hostHeader: requestHeaderValue(headers, "host"),
            tokenHeader: requestHeaderValue(headers, sessionHeaderName),
            expectedHost: expectedAdminHost(nextConfig),
            session: nextConfig.session,
            sessionHeaderName
        });

        if (!readDecision.allowed) {
            return jsonResponse(403, privateReadBlockedResponse(health, readDecision));
        }

        const editorialSummary = await evaluateEditorialSummary(nextConfig);
        return jsonResponse(200, editorialSummaryResponse(health, editorialSummary));
    }

    if (pathname === "/api/admin/documents/resume-main") {
        const health = await evaluateAdminHealth({ remoteAddress, config: nextConfig });

        if (!hasPrivateReadAccess(health)) {
            return jsonResponse(403, blockedHealthResponse(health));
        }

        const readDecision = evaluateAdminPrivateReadGuard({
            method,
            remoteAddress,
            hostHeader: requestHeaderValue(headers, "host"),
            tokenHeader: requestHeaderValue(headers, sessionHeaderName),
            expectedHost: expectedAdminHost(nextConfig),
            session: nextConfig.session,
            sessionHeaderName
        });

        if (!readDecision.allowed) {
            return jsonResponse(403, privateReadBlockedResponse(health, readDecision));
        }

        const readModel = await evaluateResumeDocumentReadModel(nextConfig);
        return jsonResponse(readModel.statusCode, resumeDocumentResponse(health, readModel));
    }

    if (pathname === "/admin") {
        const health = await evaluateAdminHealth({ remoteAddress, config: nextConfig });

        if (!hasPrivateReadAccess(health)) {
            const overlayState = health.health && health.health.sshTunnel && health.health.sshTunnel.status === "connected"
                ? "locked"
                : "blocked";
            return response(403, await renderAdminOverlayShell(nextConfig, {
                blocked: overlayState === "blocked",
                overlayState,
                writeEnabled: false
            }));
        }

        return response(200, await renderAdminOverlayShell(nextConfig, {
            overlayState: "connected",
            writeEnabled: Boolean(health.writeEnabled)
        }));
    }

    if (pathname === "/admin/resume") {
        const health = await evaluateAdminHealth({ remoteAddress, config: nextConfig });

        if (!hasPrivateReadAccess(health)) {
            return response(403, renderBlockedDashboard(health));
        }

        return response(200, renderResumeEditorBody(nextConfig, health));
    }

    return jsonResponse(404, { error: "not found", safeMode: true, writeEnabled: false, actionsLocked: [...ADMIN_LOCKED_ACTIONS] });
}

function getRemoteAddress(req) {
    return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
}

export function createAdminServer(options = {}) {
    const config = createAdminConfig(options);
    assertLoopbackBindHost(config.host);

    const server = http.createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
            const pathname = requestUrl.pathname.replace(/\/+$/, "") || "/";
            const remoteAddress = getRemoteAddress(req);
            const preflight = evaluateAdminMutationPreflight({
                method: req.method,
                pathname,
                remoteAddress,
                headers: req.headers,
                config
            });

            if (preflight && preflight.kind !== "allowed") {
                const lockedResponse = jsonResponse(preflight.statusCode, preflight.payload);
                res.writeHead(lockedResponse.statusCode, lockedResponse.headers);
                res.end(lockedResponse.body);
                return;
            }

            let requestBody;
            let skipMutationPreflight = false;

            if (preflight && preflight.kind === "allowed" && preflight.action === "save") {
                skipMutationPreflight = true;
                const bodyResult = await readAdminRequestBody(req, { maxBytes: getAdminJsonMaxBytes(config) });

                if (!bodyResult.ok) {
                    const bodyFailure = createResumeSaveBodyFailure(bodyResult);
                    const failureResponse = jsonResponse(bodyFailure.statusCode, bodyFailure.payload);
                    res.writeHead(failureResponse.statusCode, failureResponse.headers);
                    res.end(failureResponse.body);
                    return;
                }

                requestBody = bodyResult.rawBody;
            }

            const adminResponse = await buildAdminResponse({
                method: req.method,
                url: req.url,
                remoteAddress,
                headers: req.headers,
                body: requestBody,
                config,
                skipMutationPreflight
            });

            res.writeHead(adminResponse.statusCode, adminResponse.headers);
            res.end(adminResponse.body);
        } catch (error) {
            const body = JSON.stringify({ error: error.message || "admin server error", safeMode: true, writeEnabled: false }, null, 2);
            res.writeHead(500, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store"
            });
            res.end(`${body}\n`);
        }
    });

    server.adminConfig = config;
    return server;
}

export async function startAdminServer(options = {}) {
    const server = createAdminServer(options);
    const config = server.adminConfig;

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
            server.off("error", reject);
            resolve();
        });
    });

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : config.port;
    config.port = port;
    server.adminConfig = config;

    return {
        server,
        host: config.host,
        port,
        config: { ...config, port },
        close: () => new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        })
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startAdminServer()
        .then((running) => {
            console.log(`sbar.si admin listening on http://${running.host}:${running.port}/admin`);
            console.log("open it through SSH local forwarding, not a public proxy");
        })
        .catch((error) => {
            console.error(error.message || error);
            process.exitCode = 1;
        });
}
