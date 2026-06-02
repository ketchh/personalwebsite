const ADMIN_LOCKED_ACTIONS = ["preview", "publish", "unpublish", "upload"];

const LOCKED_ACTION_LABELS = {
    preview: "Preview",
    publish: "Publish",
    unpublish: "Unpublish",
    upload: "Upload"
};

const LOCKED_ACTION_REASONS = {
    preview: "Future guarded story; preview needs the protected document API and sanitizer path first.",
    publish: "Future guarded story; publish needs validation, audit, routing, and export controls first.",
    unpublish: "Future guarded story; unpublish needs audit and manifest export controls first.",
    upload: "Future guarded story; upload needs file policy, parser, and private storage controls first."
};

const LANGUAGE_PANELS = [
    {
        key: "it",
        label: "Italiano / IT",
        emptyDetail: "The Italian Resume translation is unavailable in this state. Save draft cannot unlock until the private Resume document is readable."
    },
    {
        key: "en",
        label: "English / EN",
        emptyDetail: "The English Resume translation is unavailable in this state. Save draft cannot unlock until the private Resume document is readable."
    }
];

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fieldLabelFromPath(fieldPath) {
    const parts = String(fieldPath).split(".");
    return parts[parts.length - 1] || fieldPath;
}

function languageKeyFromFieldPath(fieldPath) {
    const match = String(fieldPath).match(/^translations\.(it|en)\./i);
    return match ? match[1].toLowerCase() : "";
}

function renderLockedAction(action) {
    const label = LOCKED_ACTION_LABELS[action] || action;
    const reason = LOCKED_ACTION_REASONS[action] || "Locked until a future guarded story enables this action.";

    return `
        <li class="locked-action" data-locked-action="${escapeHtml(action)}" aria-disabled="true">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(reason)}</span>
        </li>
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
                ${Object.entries(area.counts || {}).map(([key, value]) => renderEditorialCount(key, value)).join("")}
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
                <li data-diagnostic="${escapeHtml(item.code || "diagnostic")}" data-level="${escapeHtml(item.level || "blocked")}">
                    <strong>${escapeHtml(item.level || "blocked")}</strong>
                    <span>${escapeHtml(item.detail || item.code || "diagnostic")}</span>
                </li>
            `).join("")}
        </ul>
    `;
}

export function renderEditorialOverviewMarkup(summary, health = {}) {
    const nextSummary = summary && typeof summary === "object"
        ? summary
        : { status: "blocked", detail: "Protected editorial summary is unavailable.", areas: [], diagnostics: [] };
    const renderAreaCards = nextSummary.status !== "blocked";
    const saveEnabled = Boolean(health && health.writeEnabled);

    return `
        <section class="admin-note editorial-overview" data-editorial-overview="${escapeHtml(nextSummary.status || "blocked")}" aria-labelledby="editorial-overview-title">
            <p class="eyebrow">private editorial overview</p>
            <h2 id="editorial-overview-title">Resume / Blog / Resources readiness</h2>
            <p>${escapeHtml(nextSummary.detail || "Protected editorial summary is unavailable.")}. ${escapeHtml(saveEnabled
                ? "Resume draft save is available through the protected editor; preview, publish, unpublish, and upload remain locked."
                : "Resume draft save is unavailable until the missing guardrails are restored; preview, publish, unpublish, and upload remain locked.")}</p>
            ${renderAreaCards ? `
                <div class="editorial-grid" aria-label="Editorial status counts">
                    ${(nextSummary.areas || []).map((area) => renderEditorialArea(area, health)).join("")}
                </div>
            ` : ""}
            ${renderEditorialDiagnostics(nextSummary.diagnostics)}
        </section>
    `;
}

function normalizeHydratedResumeReadModel(payload = {}) {
    if (payload && (payload.document || payload.validation || payload.readiness || payload.state)) {
        return {
            statusCode: payload.statusCode || 200,
            state: payload.state || "ready",
            reason: payload.reason || "Resume document state is available.",
            validation: payload.validation || { state: payload.state || "ready", reasons: [] },
            readiness: payload.readiness,
            document: payload.document
        };
    }

    return {
        statusCode: 403,
        state: "blocked",
        reason: payload && (payload.detail || payload.message) ? payload.detail || payload.message : "Protected Resume state is unavailable.",
        validation: {
            state: "blocked",
            reasons: []
        }
    };
}

function renderEditableStringField(fieldPath, value) {
    const label = fieldLabelFromPath(fieldPath);
    const language = languageKeyFromFieldPath(fieldPath);
    const markdown = /(?:^|\.)bodyMd$|(?:^|\.)markdown$/i.test(fieldPath);
    const control = markdown
        ? `<textarea class="resume-input resume-textarea" data-field-path="${escapeHtml(fieldPath)}" data-editor-language="${escapeHtml(language)}" data-editable="true" name="${escapeHtml(fieldPath)}" rows="8">${escapeHtml(value)}</textarea>`
        : `<input class="resume-input" data-field-path="${escapeHtml(fieldPath)}" data-editor-language="${escapeHtml(language)}" data-editable="true" name="${escapeHtml(fieldPath)}" type="text" value="${escapeHtml(value)}">`;

    return `
        <label class="resume-field resume-field-editable" data-field-path="${escapeHtml(fieldPath)}" data-editor-language="${escapeHtml(language)}">
            <span class="resume-field-label">${escapeHtml(label)}</span>
            <code class="resume-field-path">${escapeHtml(fieldPath)}</code>
            ${control}
        </label>
    `;
}

function renderReadonlyPrimitiveField(fieldPath, value) {
    const label = fieldLabelFromPath(fieldPath);
    const empty = value === null || value === undefined || value === "";
    const displayValue = empty ? "(empty)" : String(value);
    const markdown = /(?:^|\.)bodyMd$|(?:^|\.)markdown$/i.test(fieldPath);
    const valueMarkup = markdown
        ? `<pre class="resume-field-value is-markdown" data-field-kind="markdown">${escapeHtml(displayValue)}</pre>`
        : `<p class="resume-field-value">${escapeHtml(displayValue)}</p>`;

    return `
        <div class="resume-field" data-field-path="${escapeHtml(fieldPath)}" data-field-kind="readonly">
            <span class="resume-field-label">${escapeHtml(label)}</span>
            <code class="resume-field-path">${escapeHtml(fieldPath)}</code>
            ${valueMarkup}
        </div>
    `;
}

function renderFieldValue(fieldPath, value, options = {}) {
    const editable = Boolean(options.editable);

    if (Array.isArray(value)) {
        if (!value.length) {
            return renderReadonlyPrimitiveField(fieldPath, "[]");
        }

        return `
            <div class="resume-field-group" data-field-group="${escapeHtml(fieldPath)}">
                <h3>${escapeHtml(fieldLabelFromPath(fieldPath))}</h3>
                <div class="resume-field-grid">
                    ${value.map((item, index) => renderFieldValue(`${fieldPath}.${index}`, item, options)).join("")}
                </div>
            </div>
        `;
    }

    if (isObject(value)) {
        const entries = Object.entries(value);
        if (!entries.length) {
            return renderReadonlyPrimitiveField(fieldPath, "{}");
        }

        return `
            <div class="resume-field-group" data-field-group="${escapeHtml(fieldPath)}">
                <h3>${escapeHtml(fieldLabelFromPath(fieldPath))}</h3>
                <div class="resume-field-grid">
                    ${entries.map(([key, child]) => renderFieldValue(`${fieldPath}.${key}`, child, options)).join("")}
                </div>
            </div>
        `;
    }

    if (editable && typeof value === "string" && /^translations\.(it|en)\./.test(fieldPath)) {
        return renderEditableStringField(fieldPath, value);
    }

    return renderReadonlyPrimitiveField(fieldPath, value);
}

function renderValidationReasons(readModel) {
    const reasons = readModel && readModel.validation && Array.isArray(readModel.validation.reasons)
        ? readModel.validation.reasons
        : [];

    if (!reasons.length) {
        return `
            <p class="resume-validation-line" data-validation-result="clear">No blocking validation reasons in the private Resume document. Save draft is available here; preview, publish, unpublish, upload, and public export stay locked.</p>
        `;
    }

    return `
        <ul class="resume-validation-list" aria-label="Resume validation reasons">
            ${reasons.map((item) => `
                <li data-validation-reason="${escapeHtml(item.code || "reason")}">
                    <strong>${escapeHtml(item.path || "document")}</strong>
                    <span>${escapeHtml(item.detail || item.code || "validation reason")}</span>
                </li>
            `).join("")}
        </ul>
    `;
}

function renderReadinessDiagnostic(item) {
    const path = item.path || "document";
    const kindText = item.expectedKind || item.actualKind
        ? ` expected ${item.expectedKind || "unknown"}, actual ${item.actualKind || "unknown"}`
        : "";
    const languageText = item.language ? ` ${item.language.toUpperCase()}` : "";

    return `
        <li data-parity-path="${escapeHtml(path)}" data-diagnostic-code="${escapeHtml(item.code || "diagnostic")}">
            <code>${escapeHtml(path)}</code>
            <span>${escapeHtml(`${item.detail || item.code || "diagnostic"}${languageText}${kindText}`)}</span>
        </li>
    `;
}

function renderReadinessCheck(check) {
    const diagnostics = Array.isArray(check.diagnostics) ? check.diagnostics : [];

    return `
        <li class="readiness-check" data-readiness-check="${escapeHtml(check.key || "check")}" data-check-state="${escapeHtml(check.state || "blocked")}">
            <strong>${escapeHtml(check.label || check.key || "check")}</strong>
            <span>${escapeHtml(check.state || "blocked")}</span>
            <p>${escapeHtml(check.detail || "Resume readiness check")}</p>
            ${diagnostics.length ? `
                <ul class="readiness-diagnostics" aria-label="${escapeHtml(check.label || check.key || "check")} diagnostics">
                    ${diagnostics.map(renderReadinessDiagnostic).join("")}
                </ul>
            ` : ""}
        </li>
    `;
}

function renderParityPaths(readiness) {
    const parity = readiness && readiness.renderableFieldParity;
    const paths = parity && Array.isArray(parity.itFieldPaths) ? parity.itFieldPaths : [];

    if (!paths.length) {
        return "";
    }

    return `
        <ul class="readiness-paths" aria-label="Renderable parity field paths">
            ${paths.map((fieldPath) => `<li data-parity-path="${escapeHtml(fieldPath)}"><code>${escapeHtml(fieldPath)}</code></li>`).join("")}
        </ul>
    `;
}

function renderResumeReadiness(readModel) {
    const readiness = readModel && readModel.readiness;
    const state = readiness && readiness.state ? readiness.state : (readModel && readModel.state ? readModel.state : "locked");

    if (!readiness) {
        return `
            <section class="admin-note resume-readiness" data-resume-readiness="limited" data-readiness-state="${escapeHtml(state)}" aria-labelledby="resume-readiness-title">
                <p class="eyebrow">readiness checklist / limited</p>
                <h2 id="resume-readiness-title">Resume readiness checklist</h2>
                <p>Readiness details are limited because the private Resume document is not safely readable in this state. Save draft is unavailable here; preview, publish, unpublish, upload, export, and manifest writes remain locked.</p>
            </section>
        `;
    }

    const checks = Array.isArray(readiness.checks) ? readiness.checks : [];

    return `
        <section class="admin-note resume-readiness" data-resume-readiness="resume" data-readiness-state="${escapeHtml(readiness.state || state)}" aria-labelledby="resume-readiness-title">
            <p class="eyebrow">readiness checklist / save-enabled</p>
            <h2 id="resume-readiness-title">Resume readiness checklist</h2>
            <p>${escapeHtml(readiness.reason || "Resume readiness is available.")}</p>
            <p class="mono">saveEnabled: true / publishEnabled: false / Preview, Publish, Unpublish, Upload, export, and manifest writes locked</p>
            <ul class="readiness-checks" aria-label="Resume readiness checks">
                ${checks.map(renderReadinessCheck).join("")}
            </ul>
            ${renderParityPaths(readiness)}
        </section>
    `;
}

function renderLanguagePanel(panel, readModel, editable) {
    const translations = readModel && readModel.document && isObject(readModel.document.translations)
        ? readModel.document.translations
        : null;
    const translation = translations && isObject(translations[panel.key]) ? translations[panel.key] : null;

    return `
        <article class="admin-note editor-language-panel" data-editor-language="${escapeHtml(panel.key)}" aria-labelledby="resume-editor-${escapeHtml(panel.key)}-title">
            <p class="eyebrow">language panel / ${escapeHtml(panel.key)}</p>
            <h2 id="resume-editor-${escapeHtml(panel.key)}-title">${escapeHtml(panel.label)}</h2>
            ${translation ? `
                <p>${escapeHtml(editable
                    ? "Editable string leaf fields are loaded from the private Resume document. Structural changes, preview, publish, unpublish, and upload remain unavailable in this story."
                    : "Private Resume fields are visible in read-only mode for inspection. Save draft is unavailable until the document returns to a readable state.")}</p>
                <div class="resume-field-grid" aria-label="${escapeHtml(panel.label)} Resume fields">
                    ${Object.entries(translation).map(([key, child]) => renderFieldValue(`translations.${panel.key}.${key}`, child, { editable })).join("")}
                </div>
            ` : `
                <p>${escapeHtml(panel.emptyDetail)}</p>
                <div class="locked-field-region" data-editor-field-placeholder="resume-${escapeHtml(panel.key)}">
                    <span class="mono">future Resume fields locked</span>
                    <p>Hero, facts, sections, contact rows, and Markdown body fields stay hidden here until the private Resume document is present, valid, and safely readable.</p>
                </div>
            `}
        </article>
    `;
}

function renderSaveCapability(readModel, documentId, canSave) {
    if (!canSave) {
        return `
            <section class="admin-note safe-mode-note resume-editor-status" data-mode="resume-save-disabled" data-write-enabled="false">
                <p class="eyebrow">draft save / unavailable</p>
                <h2>Save draft unavailable</h2>
                <p>Save draft only unlocks when the private Resume singleton is readable and protected write capability is available. This state stays read-only so no malformed, missing, blocked, or degraded document is changed accidentally.</p>
                <p class="mono">writeEnabled: false / save unavailable / preview, publish, unpublish, and upload locked</p>
                <ul class="editor-locked-actions" aria-label="Locked Resume editor actions">
                    ${ADMIN_LOCKED_ACTIONS.map(renderLockedAction).join("")}
                </ul>
            </section>
        `;
    }

    return `
        <section class="admin-note save-draft-panel" data-resume-form-container="${escapeHtml(documentId)}">
            <p class="eyebrow">draft save / protected loopback</p>
            <h2>Save draft</h2>
            <p>Editing changes stay private until a future Publish story unlocks public export. Save draft writes only to the private Resume singleton and never publishes implicitly.</p>
            <form class="resume-editor-form" data-resume-form="${escapeHtml(documentId)}" data-document-id="${escapeHtml(documentId)}" data-save-state="clean" novalidate>
                <div class="resume-save-toolbar">
                    <button class="admin-button resume-save-button" type="submit" data-action="save" disabled>Save draft</button>
                    <p class="mono resume-save-state" data-save-state="clean" data-save-state-text tabindex="-1" aria-live="polite">clean</p>
                </div>
                <p class="resume-save-summary" data-save-summary>Draft changes stay private. Preview, Publish, Unpublish, and Upload remain locked.</p>
                <div class="editor-language-grid" aria-label="Resume language panels">
                    ${LANGUAGE_PANELS.map((panel) => renderLanguagePanel(panel, readModel, true)).join("")}
                </div>
            </form>
        </section>
    `;
}

export function renderHydratedResumeMarkup({ health = {}, payload = {} } = {}) {
    const readModel = normalizeHydratedResumeReadModel(payload);
    const actionsLocked = Array.isArray(payload.actionsLocked) && payload.actionsLocked.length ? payload.actionsLocked : ADMIN_LOCKED_ACTIONS;
    const documentId = readModel.document && readModel.document.id ? readModel.document.id : "resume-main";
    const validationState = readModel.validation && readModel.validation.state ? readModel.validation.state : readModel.state;
    const canSave = Boolean(health && health.writeEnabled && readModel.statusCode === 200 && readModel.document);

    return `
        <section class="admin-note resume-document-status" data-validation-state="${escapeHtml(validationState)}" aria-labelledby="resume-document-status-title">
            <p class="eyebrow">private document read model</p>
            <h2 id="resume-document-status-title">Resume document status</h2>
            <p>${escapeHtml(readModel.reason || "Resume document state is available.")}</p>
            ${renderValidationReasons(readModel)}
        </section>

        ${renderResumeReadiness(readModel)}

        ${renderSaveCapability(readModel, documentId, canSave)}

        <section class="admin-note safe-mode-note resume-editor-status" data-mode="partial-safe-mode" data-write-enabled="${canSave ? "true" : "false"}">
            <p class="eyebrow">remaining locked actions / future guarded stories</p>
            <h2>Locked next steps</h2>
            <p>${escapeHtml(canSave
                ? "Save draft is the only enabled mutation in this slice. Preview, Publish, Unpublish, and Upload stay locked until their guardrails and exporters are approved."
                : "Resume state is readable only after authenticated private reads. Preview, Publish, Unpublish, and Upload stay locked until their guardrails and exporters are approved.")}</p>
            <ul class="editor-locked-actions" aria-label="Locked Resume editor actions">
                ${actionsLocked.map(renderLockedAction).join("")}
            </ul>
        </section>

        ${canSave ? "" : `
            <section class="editor-language-grid" aria-label="Resume language panels">
                ${LANGUAGE_PANELS.map((panel) => renderLanguagePanel(panel, readModel, false)).join("")}
            </section>
        `}
    `;
}

function describeBootstrapFailureMessage(payload, fallback) {
    if (payload && typeof payload === "object") {
        return payload.detail || payload.message || fallback;
    }

    return fallback;
}

function metaContent(name, root = document) {
    if (!root || typeof root.querySelector !== "function") {
        return "";
    }

    const element = root.querySelector(`meta[name="${name}"]`);
    return element ? element.getAttribute("content") || "" : "";
}

export function buildPrivateAdminReadHeaders({ headerName, token } = {}) {
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

function setBootstrapState(container, state, markup) {
    if (!container) {
        return;
    }

    container.setAttribute("data-bootstrap-state", state);
    container.innerHTML = markup;
}

async function bootstrapDashboard(root = document) {
    if (!root || typeof root.querySelector !== "function") {
        return;
    }

    const container = root.querySelector('[data-admin-bootstrap="dashboard"]');
    if (!container) {
        return;
    }

    const sessionHeader = metaContent("admin-session-header", root);
    const sessionToken = metaContent("admin-session-token", root);
    const editorialEndpoint = metaContent("admin-editorial-summary-endpoint", root) || "/api/admin/editorial-summary";
    const healthEndpoint = metaContent("admin-health-endpoint", root) || "/api/admin/health";
    const headers = buildPrivateAdminReadHeaders({ headerName: sessionHeader, token: sessionToken });

    if (!headers) {
        setBootstrapState(container, "blocked", `
            <section class="admin-note editorial-overview editorial-overview-blocked" data-editorial-overview="blocked">
                <p class="eyebrow">private editorial overview / blocked</p>
                <h2>Resume / Blog / Resources readiness</h2>
                <p>Protected editorial summary is unavailable because the local admin session token is missing.</p>
            </section>
        `);
        return;
    }

    const [healthResult, editorialResult] = await Promise.all([
        fetchJson(healthEndpoint),
        fetchJson(editorialEndpoint, { headers })
    ]);

    if (!editorialResult.ok) {
        setBootstrapState(container, "blocked", `
            <section class="admin-note editorial-overview editorial-overview-blocked" data-editorial-overview="blocked">
                <p class="eyebrow">private editorial overview / blocked</p>
                <h2>Resume / Blog / Resources readiness</h2>
                <p>${escapeHtml(describeBootstrapFailureMessage(editorialResult.payload, "Protected editorial summary was blocked before editorial data was exposed."))}</p>
            </section>
        `);
        return;
    }

    const healthPayload = healthResult.ok && healthResult.payload ? healthResult.payload : {};
    setBootstrapState(container, "ready", renderEditorialOverviewMarkup(editorialResult.payload && editorialResult.payload.editorial, healthPayload));
}

async function bootstrapResume(root = document) {
    if (!root || typeof root.querySelector !== "function") {
        return;
    }

    const container = root.querySelector('[data-admin-bootstrap="resume"]');
    if (!container) {
        return;
    }

    const sessionHeader = metaContent("admin-session-header", root);
    const sessionToken = metaContent("admin-session-token", root);
    const healthEndpoint = metaContent("admin-health-endpoint", root) || "/api/admin/health";
    const documentEndpoint = metaContent("admin-resume-document-endpoint", root) || "/api/admin/documents/resume-main";
    const headers = buildPrivateAdminReadHeaders({ headerName: sessionHeader, token: sessionToken });

    if (!headers) {
        setBootstrapState(container, "blocked", renderHydratedResumeMarkup({
            health: {},
            payload: {
                state: "blocked",
                reason: "Protected Resume state is unavailable because the local admin session token is missing.",
                validation: { state: "blocked", reasons: [] },
                actionsLocked: ADMIN_LOCKED_ACTIONS
            }
        }));
        return;
    }

    const [healthResult, documentResult] = await Promise.all([
        fetchJson(healthEndpoint),
        fetchJson(documentEndpoint, { headers })
    ]);

    const healthPayload = healthResult.ok && healthResult.payload ? healthResult.payload : {};
    const payload = documentResult.ok
        ? documentResult.payload
        : {
            state: "blocked",
            reason: describeBootstrapFailureMessage(documentResult.payload, "Protected Resume state was blocked before draft data was exposed."),
            validation: { state: "blocked", reasons: [] },
            actionsLocked: ADMIN_LOCKED_ACTIONS
        };

    setBootstrapState(container, documentResult.ok ? "ready" : "blocked", renderHydratedResumeMarkup({
        health: healthPayload,
        payload
    }));

    if (documentResult.ok) {
        initResumeEditor(container);
    }
}

export async function initAdminBootstrap(root = document) {
    await bootstrapDashboard(root);
    await bootstrapResume(root);
}

export function collectDirtyResumeFields(initialValues = {}, currentValues = {}) {
    const dirty = {};
    const fieldPaths = new Set([...Object.keys(initialValues), ...Object.keys(currentValues)]);

    for (const fieldPath of fieldPaths) {
        const initialValue = typeof initialValues[fieldPath] === "string" ? initialValues[fieldPath] : "";
        const currentValue = typeof currentValues[fieldPath] === "string" ? currentValues[fieldPath] : "";

        if (initialValue !== currentValue) {
            dirty[fieldPath] = currentValue;
        }
    }

    return dirty;
}

export function buildResumeSaveRequest({ documentId, initialValues = {}, currentValues = {} } = {}) {
    return {
        documentId,
        fields: collectDirtyResumeFields(initialValues, currentValues)
    };
}

export function describeResumeSaveState(state, options = {}) {
    switch (state) {
        case "dirty":
            return {
                label: "dirty",
                message: "Unsaved draft changes are ready to stay private."
            };
        case "saving":
            return {
                label: "saving",
                message: "Saving private Resume draft…"
            };
        case "saved":
            return {
                label: "saved draft",
                message: options.updatedAt
                    ? `Draft saved at ${options.updatedAt}. Public site unchanged.`
                    : "Draft saved. Public site unchanged."
            };
        case "error":
            return {
                label: "error",
                message: options.message || "Save draft failed. No content changed."
            };
        case "clean":
        default:
            return {
                label: "clean",
                message: "Draft changes stay private. Preview, Publish, Unpublish, and Upload remain locked."
            };
    }
}

function editableControls(form) {
    return [...form.querySelectorAll("[data-editable='true'][data-field-path]")];
}

function currentResumeValues(form) {
    return editableControls(form).reduce((values, control) => {
        const fieldPath = control.getAttribute("data-field-path") || "";
        values[fieldPath] = typeof control.value === "string" ? control.value : "";
        return values;
    }, {});
}

function setResumeSaveState(form, state, options = {}) {
    const nextState = describeResumeSaveState(state, options);
    const button = form.querySelector("[data-action='save']");
    const stateText = form.querySelector("[data-save-state-text]");
    const summary = form.querySelector("[data-save-summary]");

    form.setAttribute("data-save-state", state);

    if (button) {
        button.disabled = state === "clean" || state === "saving" || state === "saved" || options.disabled === true;
    }

    if (stateText) {
        stateText.setAttribute("data-save-state", state);
        stateText.textContent = nextState.label;
    }

    if (summary) {
        summary.textContent = nextState.message;
    }

    if ((state === "saved" || state === "error") && stateText && typeof stateText.focus === "function") {
        stateText.focus();
    }
}

function syncResumeDirtyState(form, initialValues) {
    const request = buildResumeSaveRequest({
        documentId: form.getAttribute("data-document-id") || "resume-main",
        initialValues,
        currentValues: currentResumeValues(form)
    });
    const hasDirtyFields = Object.keys(request.fields).length > 0;
    setResumeSaveState(form, hasDirtyFields ? "dirty" : "clean");
    return request;
}

async function submitResumeSave(form, initialValues) {
    const sessionHeader = metaContent("admin-session-header");
    const sessionToken = metaContent("admin-session-token");
    const endpoint = metaContent("resume-save-endpoint") || "/api/admin/documents/resume-main";

    if (!sessionHeader || !sessionToken) {
        setResumeSaveState(form, "error", { message: "Save draft is unavailable because the local admin session token is missing." });
        return { initialValues };
    }

    const request = buildResumeSaveRequest({
        documentId: form.getAttribute("data-document-id") || "resume-main",
        initialValues,
        currentValues: currentResumeValues(form)
    });

    if (!Object.keys(request.fields).length) {
        setResumeSaveState(form, "clean");
        return { initialValues };
    }

    setResumeSaveState(form, "saving");

    let response;
    try {
        response = await fetch(endpoint, {
            method: "PUT",
            headers: {
                "content-type": "application/json; charset=utf-8",
                [sessionHeader]: sessionToken
            },
            body: JSON.stringify(request)
        });
    } catch {
        setResumeSaveState(form, "error", { message: "Save draft failed before content changed." });
        return { initialValues };
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const message = payload && (payload.detail || payload.message)
            ? payload.detail || payload.message
            : "Save draft failed before content changed.";
        setResumeSaveState(form, "error", { message });
        return { initialValues };
    }

    const nextValues = currentResumeValues(form);
    setResumeSaveState(form, "saved", {
        updatedAt: payload && payload.document ? payload.document.updatedAt : undefined,
        disabled: true
    });
    return {
        initialValues: { ...nextValues }
    };
}

function initResumeEditor(root = document) {
    const forms = typeof root.querySelectorAll === "function"
        ? [...root.querySelectorAll("[data-resume-form]")]
        : [];

    forms.forEach((form) => {
        let initialValues = currentResumeValues(form);
        setResumeSaveState(form, "clean");

        editableControls(form).forEach((control) => {
            control.addEventListener("input", () => {
                syncResumeDirtyState(form, initialValues);
            });
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const result = await submitResumeSave(form, initialValues);
            initialValues = result && result.initialValues ? result.initialValues : initialValues;
        });
    });
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initResumeEditor(document);
            initAdminBootstrap(document);
        });
    } else {
        initResumeEditor(document);
        initAdminBootstrap(document);
    }
}
