function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function metaContent(name, root = document) {
    if (!root || typeof root.querySelector !== "function") {
        return "";
    }

    const element = root.querySelector(`meta[name="${name}"]`);
    return element ? element.getAttribute("content") || "" : "";
}

function buildPrivateAdminReadHeaders({ headerName, token } = {}) {
    if (!headerName || !token) {
        return null;
    }

    return {
        [headerName]: token
    };
}

async function fetchJson(endpoint, options = {}) {
    const response = await fetch(endpoint, options);
    let payload = null;

    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    return {
        ok: response.ok,
        status: response.status,
        payload
    };
}

export function getAdminOverlayView(hashValue) {
    const rawHash = typeof hashValue === "string"
        ? hashValue
        : typeof window !== "undefined" && window.location
            ? window.location.hash
            : "";
    const key = rawHash.replace(/^#\/?/, "").split("/")[0];

    if (key === "resume" || key === "blog" || key === "resources") {
        return key;
    }

    return "home";
}

export function summarizeEditorialState(payload = {}) {
    const editorial = payload && payload.editorial && typeof payload.editorial === "object"
        ? payload.editorial
        : null;
    const areas = Array.isArray(editorial && editorial.areas) ? editorial.areas : [];
    const totals = { draft: 0, ready: 0, published: 0, blocked: 0 };

    for (const area of areas) {
        const counts = area && area.counts && typeof area.counts === "object" ? area.counts : {};
        totals.draft += Number(counts.draft || 0);
        totals.ready += Number(counts.ready || 0);
        totals.published += Number(counts.published || 0);
        totals.blocked += Number(counts.blocked || 0);
    }

    return {
        available: Boolean(editorial && editorial.status === "connected"),
        detail: editorial && editorial.detail ? editorial.detail : "Protected editorial summary is unavailable.",
        totals
    };
}

function hasConnectedTunnel(health) {
    return Boolean(health && health.health && health.health.sshTunnel && health.health.sshTunnel.status === "connected");
}

function draftCountLabel(totalDrafts) {
    if (totalDrafts === 1) {
        return "draft view / 1 draft";
    }

    return `draft view / ${totalDrafts} drafts`;
}

function normalizeOverlayLanguage(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized.startsWith("it")) {
        return "it";
    }

    if (normalized.startsWith("en")) {
        return "en";
    }

    return "";
}

function firstNonEmptyString(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return "";
}

function sanitizeResumeDraftLine(value) {
    return String(value || "")
        .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+)/, "")
        .replace(/[`*>]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function buildResumeDraftBody(translation = {}) {
    const lines = [];

    if (typeof translation.bodyMd === "string") {
        lines.push(...translation.bodyMd.split(/\r?\n/));
    }

    if (Array.isArray(translation.sections)) {
        translation.sections.forEach((section) => {
            if (!section || typeof section !== "object") {
                return;
            }

            lines.push(section.title || "");

            if (Array.isArray(section.items)) {
                section.items.forEach((item) => {
                    if (!item || typeof item !== "object") {
                        return;
                    }

                    lines.push(item.summary || item.label || "");
                });
            }
        });
    }

    if (Array.isArray(translation.skills) && translation.skills.length) {
        lines.push(translation.skills.join(", "));
    }

    return lines
        .map(sanitizeResumeDraftLine)
        .filter(Boolean)
        .slice(0, 3)
        .join(" ");
}

function normalizeResumeDraftContacts(translation = {}) {
    return Array.isArray(translation.contacts)
        ? translation.contacts
            .map((item) => {
                const nextItem = item && typeof item === "object" ? item : {};
                const href = typeof nextItem.href === "string" ? nextItem.href : "";
                const label = firstNonEmptyString(nextItem.label, nextItem.value, href);
                const value = firstNonEmptyString(nextItem.value, href, nextItem.label);

                return {
                    label,
                    value,
                    href
                };
            })
            .filter((item) => item.label || item.value || item.href)
        : [];
}

export function buildPrivateResumeDraftModel({
    view = "home",
    overlayState = "blocked",
    resume = null,
    language = "it"
} = {}) {
    const normalizedLanguage = normalizeOverlayLanguage(language) || "it";
    const resumePayload = resume && typeof resume === "object" ? resume : null;
    const documentPayload = resumePayload && resumePayload.document && typeof resumePayload.document === "object"
        ? resumePayload.document
        : null;
    const translation = documentPayload && documentPayload.translations && typeof documentPayload.translations === "object"
        ? documentPayload.translations[normalizedLanguage]
        : null;
    const title = translation && typeof translation === "object"
        ? firstNonEmptyString(
            translation.title,
            translation.hero && translation.hero.title,
            translation.hero && translation.hero.headline,
            translation.hero && translation.hero.name
        )
        : "";
    const summary = translation && typeof translation === "object"
        ? firstNonEmptyString(
            translation.summary,
            translation.hero && translation.hero.summary,
            translation.description
        )
        : "";
    const body = translation && typeof translation === "object" ? buildResumeDraftBody(translation) : "";
    const contacts = translation && typeof translation === "object" ? normalizeResumeDraftContacts(translation) : [];
    const readState = String(resumePayload && resumePayload.state ? resumePayload.state : "").toLowerCase();
    const active = view === "resume"
        && overlayState === "connected"
        && readState === "ready"
        && Boolean(documentPayload)
        && String(documentPayload.status || "").toLowerCase() === "draft"
        && Boolean(translation && typeof translation === "object")
        && Boolean(title || summary || body || contacts.length);

    return {
        active,
        language: normalizedLanguage,
        label: "draft / non-public",
        title,
        summary,
        body,
        contacts
    };
}

export function renderPrivateResumeDraftMarkup(model = {}) {
    if (!model || !model.active) {
        return "";
    }

    return `
        <section class="card admin-resume-draft-card" data-admin-resume-draft-card="true" data-admin-resume-language="${escapeHtml(model.language || "it")}" data-admin-draft-state="draft">
            <div class="section-head">
                <span class="section-path">./private/resume</span>
                <span>${escapeHtml(String(model.language || "it").toUpperCase())}</span>
            </div>
            <p class="admin-resume-draft-pill">${escapeHtml(model.label || "draft / non-public")}</p>
            ${model.title ? `<h2 class="section-title admin-resume-draft-title">${escapeHtml(model.title)}</h2>` : ""}
            ${model.summary ? `<p class="admin-resume-draft-summary">${escapeHtml(model.summary)}</p>` : ""}
            ${model.body ? `<p class="admin-resume-draft-body">${escapeHtml(model.body)}</p>` : ""}
            ${model.contacts && model.contacts.length ? `
                <div class="admin-resume-draft-contacts" aria-label="Private Resume draft contacts">
                    ${model.contacts.map((item) => `
                        <div class="admin-resume-draft-contact">
                            <span class="admin-resume-draft-contact-label">${escapeHtml(item.label || "contact")}</span>
                            ${item.href
                                ? `<a class="admin-resume-draft-contact-value" href="${escapeHtml(item.href)}">${escapeHtml(item.value || item.href)}</a>`
                                : `<span class="admin-resume-draft-contact-value">${escapeHtml(item.value || item.label || "")}</span>`}
                        </div>
                    `).join("")}
                </div>
            ` : ""}
        </section>
    `;
}

function stripPrivateResumeDraftMarkup(markup) {
    return String(markup || "").replace(/<section class="card admin-resume-draft-card" data-admin-resume-draft-card="true"[\s\S]*?<\/section>\s*/i, "");
}

export function applyPrivateResumeDraftLayer(root, model = {}) {
    if (!root || typeof root.querySelector !== "function") {
        return;
    }

    const stage = root.querySelector("[data-page-rail-stage]");

    if (!stage || typeof stage.innerHTML !== "string") {
        return;
    }

    const baseMarkup = stripPrivateResumeDraftMarkup(stage.innerHTML);
    const nextMarkup = model && model.active
        ? `${renderPrivateResumeDraftMarkup(model)}\n${baseMarkup}`
        : baseMarkup;

    stage.innerHTML = nextMarkup;

    if (typeof stage.setAttribute === "function") {
        stage.setAttribute("data-admin-resume-draft-visible", model && model.active ? "true" : "false");
    }
}

function getOverlayLanguage(root = document) {
    const documentElement = root && root.documentElement
        ? root.documentElement
        : typeof document !== "undefined"
            ? document.documentElement
            : null;
    const globeCurrent = root && typeof root.querySelector === "function"
        ? root.querySelector("#language-globe-current")
        : null;

    return normalizeOverlayLanguage(documentElement && documentElement.lang)
        || normalizeOverlayLanguage(globeCurrent && globeCurrent.textContent)
        || "it";
}

export function buildAdminOverlayModel({
    view = "home",
    health = null,
    editorial = null,
    resume = null,
    sessionReady = false,
    panelOpen = false
} = {}) {
    const summary = summarizeEditorialState(editorial || {});
    const tunnelConnected = hasConnectedTunnel(health);
    const overlayState = !tunnelConnected
        ? "blocked"
        : sessionReady && summary.available
            ? "connected"
            : "locked";
    const canAdvertiseWrites = overlayState === "connected" && Boolean(health && health.writeEnabled);
    const resumeDocument = resume && resume.document && typeof resume.document === "object" ? resume.document : null;
    const resumeDraftVisible = overlayState === "connected"
        && view === "resume"
        && resumeDocument
        && String(resumeDocument.status || "").toLowerCase() === "draft";
    const diagnosticsState = overlayState === "connected" ? "unavailable" : "blocked";
    const diagnosticsMessage = diagnosticsState === "blocked"
        ? "Diagnostics blocked until the protected admin overlay is connected. No host data was exposed."
        : "Diagnostics unavailable in this slice. The in-site panel shell is present, but real host snapshots stay locked for a later guarded story.";
    const modeLabel = overlayState === "connected"
        ? "admin mode / connected"
        : overlayState === "blocked"
            ? "admin mode / blocked"
            : "admin mode / locked";
    const writeLabel = overlayState === "connected"
        ? (canAdvertiseWrites ? "write enabled" : "write locked")
        : "write state / locked";
    let draftLabel = "draft view / hidden";

    if (resumeDraftVisible) {
        draftLabel = "draft / non-public";
    } else if (overlayState === "connected") {
        draftLabel = summary.totals.draft > 0 ? draftCountLabel(summary.totals.draft) : "draft view / no draft";
    }

    return {
        view,
        overlayState,
        writeEnabled: canAdvertiseWrites,
        modeLabel,
        writeLabel,
        draftLabel,
        draftVisible: resumeDraftVisible,
        diagnosticsState,
        diagnosticsMessage,
        panelOpen: Boolean(panelOpen)
    };
}

export function renderAdminOverlayStripMarkup(model = {}) {
    return `
        <p class="admin-overlay-eyebrow">private overlay / ${escapeHtml(model.overlayState || "loading")}</p>
        <div class="admin-overlay-pills">
            <p class="admin-overlay-pill" data-admin-pill="mode">${escapeHtml(model.modeLabel || "admin mode / loading")}</p>
            <p class="admin-overlay-pill" data-admin-pill="write">${escapeHtml(model.writeLabel || "write state / loading")}</p>
            <p class="admin-overlay-pill" data-admin-pill="draft" data-draft-visible="${model.draftVisible ? "true" : "false"}">${escapeHtml(model.draftLabel || "draft view / loading")}</p>
            <button class="admin-overlay-pill admin-overlay-pill--button" type="button" data-admin-diagnostics-toggle aria-expanded="${model.panelOpen ? "true" : "false"}" aria-controls="admin-diagnostics-panel">Diagnostics</button>
        </div>
    `;
}

export function renderAdminDiagnosticsPanelMarkup(model = {}) {
    return `
        <div class="admin-diagnostics-panel__inner">
            <div class="admin-diagnostics-panel__header">
                <p class="admin-overlay-eyebrow">diagnostics / ${escapeHtml(model.diagnosticsState || "unavailable")}</p>
                <button class="admin-diagnostics-close" type="button" data-admin-diagnostics-close aria-label="Close Diagnostics">Close</button>
            </div>
            <h2 class="admin-diagnostics-title">Diagnostics</h2>
            <p class="admin-diagnostics-copy" data-admin-diagnostics-copy>${escapeHtml(model.diagnosticsMessage || "Diagnostics unavailable.")}</p>
        </div>
    `;
}

export function applyAdminOverlayState(root, model = {}) {
    if (!root || typeof root.querySelector !== "function") {
        return;
    }

    const strip = root.querySelector("[data-admin-overlay-shell]");
    const panel = root.querySelector("[data-admin-diagnostics-panel]");

    if (strip) {
        strip.setAttribute("data-overlay-state", model.overlayState || "loading");
        strip.setAttribute("data-write-enabled", model.writeEnabled ? "true" : "false");
        strip.innerHTML = renderAdminOverlayStripMarkup(model);
    }

    if (panel) {
        const panelState = model.panelOpen ? (model.diagnosticsState || "unavailable") : "closed";
        panel.setAttribute("data-panel-state", panelState);
        panel.innerHTML = renderAdminDiagnosticsPanelMarkup(model);
        panel.hidden = !model.panelOpen;
        panel.setAttribute("aria-hidden", model.panelOpen ? "false" : "true");
    }

    if (typeof document !== "undefined" && document.body) {
        document.body.setAttribute("data-admin-overlay-state", model.overlayState || "loading");
    }
}

async function bootstrapAdminOverlay(root = document) {
    if (!root || typeof root.querySelector !== "function") {
        return;
    }

    const strip = root.querySelector("[data-admin-overlay-shell]");
    const panel = root.querySelector("[data-admin-diagnostics-panel]");

    if (!strip || !panel) {
        return;
    }

    const sessionHeader = metaContent("admin-session-header", root);
    const sessionToken = metaContent("admin-session-token", root);
    const healthEndpoint = metaContent("admin-health-endpoint", root) || "/api/admin/health";
    const editorialEndpoint = metaContent("admin-editorial-summary-endpoint", root) || "/api/admin/editorial-summary";
    const resumeEndpoint = metaContent("admin-resume-document-endpoint", root) || "/api/admin/documents/resume-main";
    const headers = buildPrivateAdminReadHeaders({ headerName: sessionHeader, token: sessionToken });
    const state = {
        panelOpen: false,
        view: getAdminOverlayView(),
        health: null,
        editorial: null,
        resume: null,
        sessionReady: Boolean(headers)
    };

    async function refreshSharedState() {
        const healthResult = await fetchJson(healthEndpoint).catch(() => ({ ok: false, payload: null }));
        state.health = healthResult.ok ? healthResult.payload : null;

        if (!headers) {
            state.editorial = null;
            return;
        }

        const editorialResult = await fetchJson(editorialEndpoint, { headers }).catch(() => ({ ok: false, payload: null }));
        state.editorial = editorialResult.ok ? editorialResult.payload : null;
    }

    async function refreshRouteState() {
        state.view = getAdminOverlayView();

        if (state.view !== "resume" || !headers) {
            state.resume = null;
            return;
        }

        const resumeResult = await fetchJson(resumeEndpoint, { headers }).catch(() => ({ ok: false, payload: null }));
        state.resume = resumeResult.ok ? resumeResult.payload : null;
    }

    function bindOverlayButton(button, key, handler) {
        if (!button || typeof button.addEventListener !== "function") {
            return;
        }

        if (typeof button.getAttribute === "function" && button.getAttribute("data-overlay-bound") === key) {
            return;
        }

        if (typeof button.setAttribute === "function") {
            button.setAttribute("data-overlay-bound", key);
        }

        button.addEventListener("click", handler);
    }

    function apply() {
        const model = buildAdminOverlayModel({
            view: state.view,
            health: state.health,
            editorial: state.editorial,
            resume: state.resume,
            sessionReady: state.sessionReady,
            panelOpen: state.panelOpen
        });
        applyAdminOverlayState(root, model);
        applyPrivateResumeDraftLayer(root, buildPrivateResumeDraftModel({
            view: state.view,
            overlayState: model.overlayState,
            resume: state.resume,
            language: getOverlayLanguage(root)
        }));
        bindOverlayEvents();
    }

    function bindOverlayEvents() {
        const toggle = root.querySelector("[data-admin-diagnostics-toggle]");
        const close = root.querySelector("[data-admin-diagnostics-close]");

        bindOverlayButton(toggle, "toggle", () => {
            state.panelOpen = !state.panelOpen;
            apply();
        });

        bindOverlayButton(close, "close", () => {
            state.panelOpen = false;
            apply();
        });
    }

    await refreshSharedState();
    await refreshRouteState();
    apply();

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("hashchange", async () => {
            await refreshRouteState();
            apply();
        });
    }

    if (typeof MutationObserver !== "undefined") {
        const languageRoot = root && root.documentElement
            ? root.documentElement
            : typeof document !== "undefined"
                ? document.documentElement
                : null;

        if (languageRoot) {
            const languageObserver = new MutationObserver(() => {
                apply();
            });
            languageObserver.observe(languageRoot, { attributes: true, attributeFilter: ["lang"] });
        }
    }
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            bootstrapAdminOverlay(document);
        });
    } else {
        bootstrapAdminOverlay(document);
    }
}
