import fs from "node:fs/promises";
import path from "node:path";
import { appendAuditRecord } from "./audit.js";
import { parseAdminJsonBody, getAdminJsonMaxBytes } from "./body-intake.js";
import { ADMIN_LOCKED_ACTIONS } from "./health.js";
import {
    RESUME_DOCUMENT_ID,
    RESUME_DOCUMENT_RELATIVE_PATH,
    evaluateResumeDocumentReadModel,
    resolveResumeDocumentPath,
    validateResumeDocument
} from "./resume-document.js";
import { evaluateResumeReadiness } from "./resume-readiness.js";

const LOCKED_METADATA_PATHS = new Set(["id", "type", "slug", "status", "createdAt", "updatedAt", "publishedAt"]);

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reason(code, detail, fieldPath = "document") {
    return { code, detail, path: fieldPath };
}

function savePayload(overrides = {}) {
    return {
        service: "sbar.si admin",
        safeMode: true,
        writeEnabled: true,
        actionsLocked: [...ADMIN_LOCKED_ACTIONS],
        action: "save",
        ...overrides
    };
}

function errorPayload(statusCode, { message, detail, reasons = [], error = "resume save blocked" } = {}) {
    return {
        statusCode,
        payload: savePayload({
            error,
            message,
            detail,
            reasons: reasons.map((item) => ({
                code: item.code,
                ...(item.path ? { path: item.path } : {})
            }))
        })
    };
}

function joinPath(basePath, key) {
    return basePath ? `${basePath}.${key}` : key;
}

function collectEditableStringLeafPaths(value, basePath = "", results = new Map()) {
    if (typeof value === "string") {
        results.set(basePath, value);
        return results;
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => collectEditableStringLeafPaths(item, joinPath(basePath, String(index)), results));
        return results;
    }

    if (isObject(value)) {
        Object.entries(value).forEach(([key, child]) => collectEditableStringLeafPaths(child, joinPath(basePath, key), results));
    }

    return results;
}

function traversePath(target, fieldPath) {
    const segments = String(fieldPath || "").split(".").filter(Boolean);
    let current = target;

    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];

        if (Array.isArray(current)) {
            if (!/^\d+$/.test(segment)) {
                return { exists: false, value: undefined };
            }
            const nextIndex = Number(segment);
            if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= current.length) {
                return { exists: false, value: undefined };
            }
            current = current[nextIndex];
            continue;
        }

        if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
            return { exists: false, value: undefined };
        }

        current = current[segment];
    }

    return { exists: true, value: current };
}

function setExistingPath(target, fieldPath, value) {
    const segments = String(fieldPath || "").split(".").filter(Boolean);
    let current = target;

    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];

        if (Array.isArray(current)) {
            const nextIndex = Number(segment);
            if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= current.length) {
                return false;
            }
            current = current[nextIndex];
            continue;
        }

        if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
            return false;
        }

        current = current[segment];
    }

    const lastSegment = segments[segments.length - 1];

    if (Array.isArray(current)) {
        const nextIndex = Number(lastSegment);
        if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= current.length) {
            return false;
        }
        current[nextIndex] = value;
        return true;
    }

    if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, lastSegment)) {
        return false;
    }

    current[lastSegment] = value;
    return true;
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function nextTimestamp(now) {
    const value = typeof now === "function" ? now() : new Date();
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function safeReadModelReasons(readModel) {
    const validationReasons = readModel && readModel.validation && Array.isArray(readModel.validation.reasons)
        ? readModel.validation.reasons
        : [];

    if (validationReasons.length) {
        return validationReasons.map((item) => reason(item.code, item.detail, item.path || "document"));
    }

    return [reason("resume-document-unavailable", readModel && readModel.reason ? readModel.reason : "Resume document is not available for save")];
}

function normalizeFieldPatch(requestBody, document) {
    if (!isObject(requestBody)) {
        return {
            ok: false,
            reasons: [reason("non-object-json", "request body must be a JSON object")]
        };
    }

    if (requestBody.documentId !== RESUME_DOCUMENT_ID) {
        return {
            ok: false,
            reasons: [reason("invalid-document-id", "documentId must match the Resume singleton", "documentId")]
        };
    }

    if (!isObject(requestBody.fields) || !Object.keys(requestBody.fields).length) {
        return {
            ok: false,
            reasons: [reason("missing-fields", "fields patch must be a non-empty JSON object", "fields")]
        };
    }

    const editableFields = collectEditableStringLeafPaths(document.translations && {
        it: document.translations.it,
        en: document.translations.en
    }, "translations");
    const nextFields = {};
    const reasons = [];

    for (const [fieldPath, value] of Object.entries(requestBody.fields)) {
        if (LOCKED_METADATA_PATHS.has(fieldPath)) {
            reasons.push(reason("metadata-field-locked", "top-level metadata fields are not editable in this story", fieldPath));
            continue;
        }

        if (typeof value !== "string") {
            reasons.push(reason("invalid-field-value", "editable field values must be strings", fieldPath));
            continue;
        }

        if (editableFields.has(fieldPath)) {
            nextFields[fieldPath] = value;
            continue;
        }

        const currentPath = traversePath(document, fieldPath);
        if (currentPath.exists) {
            reasons.push(reason("non-string-field-path", "field path exists but is not an editable string leaf", fieldPath));
            continue;
        }

        reasons.push(reason("unknown-field-path", "field path is not editable in this story", fieldPath));
    }

    if (reasons.length) {
        return { ok: false, reasons };
    }

    const nextDocument = cloneJson(document);
    Object.entries(nextFields).forEach(([fieldPath, value]) => {
        setExistingPath(nextDocument, fieldPath, value);
    });
    nextDocument.status = "draft";
    nextDocument.updatedAt = nextTimestamp();

    return {
        ok: true,
        fields: nextFields,
        document: nextDocument
    };
}

async function atomicRewrite(targetPath, nextContent) {
    const directory = path.dirname(targetPath);
    const tempPath = path.join(directory, `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    await fs.writeFile(tempPath, nextContent, "utf8");

    try {
        await fs.rename(tempPath, targetPath);
    } catch (error) {
        await fs.rm(tempPath, { force: true });
        throw error;
    }
}

async function writeRejectedAudit(config, reasons) {
    await appendAuditRecord({
        config,
        record: {
            action: "save",
            result: "blocked",
            target: {
                id: RESUME_DOCUMENT_ID,
                path: RESUME_DOCUMENT_RELATIVE_PATH
            },
            reasons
        }
    });
}

function auditFailureResponse() {
    return errorPayload(500, {
        error: "audit write failed",
        message: "Save draft failed before content changed.",
        detail: "The private audit log was unavailable, so the draft was not changed.",
        reasons: [reason("audit-root-unavailable", "private audit storage is unavailable", "auditRoot")]
    });
}

export function createResumeSaveBodyFailure({ statusCode, reasons } = {}) {
    return errorPayload(statusCode || 400, {
        message: "Save draft failed before content changed.",
        detail: "The JSON request body did not pass the Admin Body Intake Gate.",
        reasons: Array.isArray(reasons) ? reasons : [reason("invalid-request-body", "JSON request body is invalid")],
        error: "resume save body rejected"
    });
}

function contentFailureResponse() {
    return errorPayload(500, {
        error: "content write failed",
        message: "Save draft failed before content changed.",
        detail: "The private Resume draft could not be written atomically.",
        reasons: [reason("content-write-failed", "private draft write failed", RESUME_DOCUMENT_RELATIVE_PATH.replaceAll(path.sep, "."))]
    });
}

export async function handleResumeDraftSave({ config = {}, body } = {}) {
    const bodyResult = parseAdminJsonBody({
        body,
        maxBytes: getAdminJsonMaxBytes(config)
    });

    if (!bodyResult.ok) {
        return createResumeSaveBodyFailure(bodyResult);
    }

    const readModel = await evaluateResumeDocumentReadModel(config);
    if (readModel.statusCode !== 200 || !readModel.document) {
        const reasons = safeReadModelReasons(readModel);
        try {
            await writeRejectedAudit(config, reasons);
        } catch {
            return auditFailureResponse();
        }

        return errorPayload(readModel.statusCode || 422, {
            message: "Save draft failed before content changed.",
            detail: readModel.reason || "Resume document is unavailable for save.",
            reasons,
            error: "resume save blocked"
        });
    }

    const patchResult = normalizeFieldPatch(bodyResult.body, readModel.document);
    if (!patchResult.ok) {
        try {
            await writeRejectedAudit(config, patchResult.reasons);
        } catch {
            return auditFailureResponse();
        }

        return errorPayload(422, {
            message: "Save draft failed before content changed.",
            detail: "The requested field patch is outside the allowed save surface for this story.",
            reasons: patchResult.reasons,
            error: "resume save blocked"
        });
    }

    const validation = validateResumeDocument(patchResult.document);
    if (validation.state === "blocked") {
        try {
            await writeRejectedAudit(config, validation.reasons);
        } catch {
            return auditFailureResponse();
        }

        return errorPayload(422, {
            message: "Save draft failed before content changed.",
            detail: "The patched Resume draft failed safety validation.",
            reasons: validation.reasons,
            error: "resume save blocked"
        });
    }

    let resumePath;
    try {
        resumePath = await resolveResumeDocumentPath(config);
    } catch {
        return contentFailureResponse();
    }

    if (isObject(resumePath) && resumePath.state) {
        const reasons = safeReadModelReasons(resumePath);
        try {
            await writeRejectedAudit(config, reasons);
        } catch {
            return auditFailureResponse();
        }

        return errorPayload(resumePath.statusCode || 422, {
            message: "Save draft failed before content changed.",
            detail: resumePath.reason || "Resume document is unavailable for save.",
            reasons,
            error: "resume save blocked"
        });
    }

    let previousRaw;
    try {
        previousRaw = await fs.readFile(resumePath, "utf8");
    } catch {
        return contentFailureResponse();
    }

    const nextRaw = `${JSON.stringify(patchResult.document, null, 2)}\n`;

    try {
        await atomicRewrite(resumePath, nextRaw);
    } catch {
        try {
            await writeRejectedAudit(config, [reason("content-write-failed", "private draft write failed", RESUME_DOCUMENT_RELATIVE_PATH.replaceAll(path.sep, "."))]);
        } catch {
            return auditFailureResponse();
        }
        return contentFailureResponse();
    }

    try {
        await appendAuditRecord({
            config,
            record: {
                action: "save",
                result: "saved",
                target: {
                    id: RESUME_DOCUMENT_ID,
                    path: RESUME_DOCUMENT_RELATIVE_PATH
                },
                reasons: []
            }
        });
    } catch {
        try {
            await atomicRewrite(resumePath, previousRaw);
        } catch {
            return contentFailureResponse();
        }
        return auditFailureResponse();
    }

    const savedValidation = validateResumeDocument(patchResult.document);
    const readiness = evaluateResumeReadiness({
        document: patchResult.document,
        validation: savedValidation
    });

    return {
        statusCode: 200,
        payload: savePayload({
            message: "Draft saved; public site unchanged.",
            detail: "Private Resume draft saved successfully and not published.",
            document: patchResult.document,
            validation: savedValidation,
            readiness
        })
    };
}
