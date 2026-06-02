import { ADMIN_LOCKED_ACTIONS } from "./health.js";

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

function fieldLabelFromPath(fieldPath) {
    const parts = String(fieldPath).split(".");
    return parts[parts.length - 1] || fieldPath;
}

function languageKeyFromFieldPath(fieldPath) {
    const match = String(fieldPath).match(/^translations\.(it|en)\./i);
    return match ? match[1].toLowerCase() : "";
}

function isEditableStringField(fieldPath, value, editable) {
    return editable && typeof value === "string" && /^translations\.(it|en)\./.test(fieldPath);
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

    if (isEditableStringField(fieldPath, value, editable)) {
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
        <li class="readiness-check" data-readiness-check="${escapeHtml(check.key)}" data-check-state="${escapeHtml(check.state)}">
            <strong>${escapeHtml(check.label || check.key)}</strong>
            <span>${escapeHtml(check.state)}</span>
            <p>${escapeHtml(check.detail || "Resume readiness check")}</p>
            ${diagnostics.length ? `
                <ul class="readiness-diagnostics" aria-label="${escapeHtml(check.label || check.key)} diagnostics">
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
        <section class="admin-note resume-readiness" data-resume-readiness="resume" data-readiness-state="${escapeHtml(readiness.state)}" aria-labelledby="resume-readiness-title">
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

function normalizeReadModel(readModel) {
    return readModel || {
        statusCode: 423,
        state: "locked",
        reason: "Private Resume document read model has not run yet.",
        validation: {
            state: "locked",
            reasons: []
        }
    };
}

function renderSaveCapability(readModel, documentId) {
    const canSave = Boolean(readModel && readModel.statusCode === 200 && readModel.document);

    if (!canSave) {
        return `
            <section class="admin-note safe-mode-note resume-editor-status" data-mode="resume-save-disabled" data-write-enabled="false">
                <p class="eyebrow">draft save / unavailable</p>
                <h2>Save draft unavailable</h2>
                <p>Save draft only unlocks when the private Resume singleton is readable. This state stays read-only so no malformed, missing, blocked, or degraded document is changed accidentally.</p>
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

export function renderResumeEditorBootstrapShellBody({ actionsLocked = ADMIN_LOCKED_ACTIONS } = {}) {
    const lockedActions = actionsLocked.length ? actionsLocked : ADMIN_LOCKED_ACTIONS;

    return `
        <section class="admin-hero resume-editor-shell" data-admin-editor="resume" data-write-enabled="false" aria-labelledby="resume-editor-title">
            <p class="eyebrow">resume editor / protected bootstrap</p>
            <h1 id="resume-editor-title">Resume editor</h1>
            <p>The private Resume editor now loads its protected state after authenticated private reads. Draft values, readiness diagnostics, and save controls stay out of the initial HTML shell.</p>
            <p class="mono">bootstrap: loading protected Resume state / preview, publish, unpublish, and upload locked</p>
            <a class="admin-link" href="/admin">Back to admin dashboard</a>
        </section>

        <div class="resume-bootstrap-root" data-admin-bootstrap="resume" data-bootstrap-state="loading">
            <section class="admin-note resume-bootstrap-panel" aria-labelledby="resume-bootstrap-title">
                <p class="eyebrow">protected bootstrap / resume</p>
                <h2 id="resume-bootstrap-title">Loading protected Resume state</h2>
                <p data-bootstrap-message>Loading the private Resume read model after authenticated private reads…</p>
            </section>
        </div>

        <section class="admin-note safe-mode-note resume-editor-status" data-mode="partial-safe-mode" data-write-enabled="false">
            <p class="eyebrow">remaining locked actions / future guarded stories</p>
            <h2>Locked next steps</h2>
            <p>Protected Resume state loads first. Preview, Publish, Unpublish, and Upload stay locked until their guardrails and exporters are approved.</p>
            <ul class="editor-locked-actions" aria-label="Locked Resume editor actions">
                ${lockedActions.map(renderLockedAction).join("")}
            </ul>
        </section>
    `;
}

export function renderResumeEditorShellBody({ actionsLocked = ADMIN_LOCKED_ACTIONS, resumeReadModel = null } = {}) {
    const lockedActions = actionsLocked.length ? actionsLocked : ADMIN_LOCKED_ACTIONS;
    const readModel = normalizeReadModel(resumeReadModel);
    const canSave = Boolean(readModel.statusCode === 200 && readModel.document);
    const documentId = readModel.document && readModel.document.id ? readModel.document.id : "resume-main";
    const documentStatus = readModel.document && readModel.document.status ? readModel.document.status : "unavailable";
    const validationState = readModel.validation && readModel.validation.state ? readModel.validation.state : readModel.state;

    return `
        <section class="admin-hero resume-editor-shell" data-admin-editor="resume" data-write-enabled="${canSave ? "true" : "false"}" data-resume-document-id="${escapeHtml(documentId)}" data-document-status="${escapeHtml(documentStatus)}" data-validation-state="${escapeHtml(validationState)}" aria-labelledby="resume-editor-title">
            <p class="eyebrow">resume editor / guarded draft save</p>
            <h1 id="resume-editor-title">Resume editor</h1>
            <p>${escapeHtml(canSave
                ? "The private Resume editor can save draft changes for existing IT/EN string leaf fields. Preview, publish, unpublish, and upload remain locked."
                : "The private Resume editor is currently read-only. Save draft is unavailable until the protected Resume document returns to a readable state.")}</p>
            <p class="mono">writeEnabled: ${canSave ? "true" : "false"} / document state: ${escapeHtml(readModel.state)} / validation: ${escapeHtml(validationState)}</p>
            <a class="admin-link" href="/admin">Back to admin dashboard</a>
        </section>

        <section class="admin-note resume-document-status" data-validation-state="${escapeHtml(validationState)}" aria-labelledby="resume-document-status-title">
            <p class="eyebrow">private document read model</p>
            <h2 id="resume-document-status-title">Resume document status</h2>
            <p>${escapeHtml(readModel.reason || "Resume document state is available.")}</p>
            ${renderValidationReasons(readModel)}
        </section>

        ${renderResumeReadiness(readModel)}

        ${renderSaveCapability(readModel, documentId)}

        <section class="admin-note safe-mode-note resume-editor-status" data-mode="partial-safe-mode" data-write-enabled="${canSave ? "true" : "false"}">
            <p class="eyebrow">remaining locked actions / future guarded stories</p>
            <h2>Locked next steps</h2>
            <p>Save draft is the only enabled mutation in this slice. Preview, Publish, Unpublish, and Upload stay locked until their guardrails and exporters are approved.</p>
            <ul class="editor-locked-actions" aria-label="Locked Resume editor actions">
                ${lockedActions.map(renderLockedAction).join("")}
            </ul>
        </section>

        ${canSave ? "" : `
            <section class="editor-language-grid" aria-label="Resume language panels">
                ${LANGUAGE_PANELS.map((panel) => renderLanguagePanel(panel, readModel, false)).join("")}
            </section>
        `}
    `;
}
