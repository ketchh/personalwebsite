import fs from "node:fs/promises";
import path from "node:path";
import { confinePath } from "./path-confinement.js";
import { evaluateResumeReadiness } from "./resume-readiness.js";

export const RESUME_DOCUMENT_ID = "resume-main";
export const RESUME_DOCUMENT_RELATIVE_PATH = path.join("documents", "resume-main.json");
const VALID_RESUME_STATUSES = new Set(["draft", "published", "archived"]);
const REFERENCE_KEYS = new Set(["href", "externalUrl", "url", "asset", "assetRef"]);
const SAFE_REFERENCE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function canAccess(target, mode) {
    try {
        await fs.access(target, mode);
        return true;
    } catch {
        return false;
    }
}

function reason(code, detail, fieldPath = "document") {
    return { code, detail, path: fieldPath };
}

function degraded(detail) {
    return {
        statusCode: 404,
        state: "degraded",
        reason: detail,
        validation: {
            state: "degraded",
            reasons: [reason("missing-resume-document", detail, RESUME_DOCUMENT_RELATIVE_PATH.replaceAll(path.sep, "."))]
        }
    };
}

function blocked(detail, code = "blocked-resume-document", fieldPath = "document") {
    return {
        statusCode: 422,
        state: "blocked",
        reason: detail,
        validation: {
            state: "blocked",
            reasons: [reason(code, detail, fieldPath)]
        }
    };
}

async function contentRootMissingState(contentRoot) {
    const resolvedRoot = path.resolve(contentRoot || "");
    const parent = path.dirname(resolvedRoot);
    const parentAccessible = await canAccess(parent, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);

    if (parentAccessible) {
        return degraded("private content root is missing; create documents/resume-main.json before Resume inspection can load values");
    }

    return blocked("private content root is missing and its parent is not accessible", "content-root-blocked", "contentRoot");
}

function safePathConfinementDetail(error) {
    const message = String(error && error.message ? error.message : "");

    if (/symlink/i.test(message)) {
        return "Resume document path failed path confinement: symlink escape rejected";
    }

    if (/traversal/i.test(message)) {
        return "Resume document path failed path confinement: traversal outside the private root rejected";
    }

    if (/public root|crossover/i.test(message)) {
        return "Resume document path failed path confinement: private/public root crossover rejected";
    }

    return "Resume document path failed path confinement";
}

export async function resolveResumeDocumentPath(config = {}) {
    const contentRoot = path.resolve(config.contentRoot || "");

    try {
        return await confinePath({
            root: contentRoot,
            candidate: RESUME_DOCUMENT_RELATIVE_PATH,
            publicRoots: [config.publicAssetRoot]
        });
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return contentRootMissingState(contentRoot);
        }

        return blocked(safePathConfinementDetail(error), "path-confinement-blocked", RESUME_DOCUMENT_RELATIVE_PATH.replaceAll(path.sep, "."));
    }
}

function isPrivateReference(value) {
    return /(^|\/)(?:\.\.|secrets?|credentials?|private|drafts?|admin)(?:\/|$)|^\/(?:home|var|etc|tmp|usr|opt|srv|root)(?:\/|$)|^[a-z]:[\\/]/i.test(value);
}

function schemeProblem(value, encoded = false) {
    const schemeMatch = value.match(/^([a-z][a-z0-9+.-]*):/i);
    if (!schemeMatch) {
        return null;
    }

    const scheme = `${schemeMatch[1].toLowerCase()}:`;
    if (SAFE_REFERENCE_SCHEMES.has(scheme)) {
        return null;
    }

    return encoded ? "unsafe reference uses an encoded unsafe URL scheme" : `unsafe reference uses ${scheme} scheme`;
}

function decodedReferenceProblem(trimmedValue) {
    if (!trimmedValue.includes("%")) {
        return null;
    }

    let decodedValue;
    try {
        decodedValue = decodeURIComponent(trimmedValue);
    } catch {
        return "unsafe reference contains malformed percent encoding";
    }

    if (decodedValue === trimmedValue) {
        return null;
    }

    if (/[\u0000-\u001f\u007f\s]/.test(decodedValue)) {
        return "unsafe reference uses encoded whitespace or control characters";
    }

    if (decodedValue.includes("\\")) {
        return "unsafe reference uses encoded backslash path separators";
    }

    if (decodedValue.startsWith("//")) {
        return "unsafe reference uses an encoded protocol-relative URL";
    }

    if (isPrivateReference(decodedValue)) {
        return "unsafe reference uses an encoded private, draft, admin, or traversal path";
    }

    return schemeProblem(decodedValue, true);
}

function referenceProblem(value) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return null;
    }

    if (/[\u0000-\u001f\u007f\s]/.test(trimmedValue)) {
        return "unsafe reference contains whitespace or control characters";
    }

    if (trimmedValue.includes("\\")) {
        return "unsafe reference contains backslash path separators";
    }

    if (trimmedValue.startsWith("//")) {
        return "unsafe reference uses a protocol-relative URL";
    }

    if (isPrivateReference(trimmedValue)) {
        return "unsafe reference points to a private, draft, admin, or traversal path";
    }

    const encodedProblem = decodedReferenceProblem(trimmedValue);
    if (encodedProblem) {
        return encodedProblem;
    }

    return schemeProblem(trimmedValue);
}

function joinFieldPath(segments) {
    return segments.join(".");
}

function collectUnsafeReferenceReasons(value, pathSegments = [], problems = []) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectUnsafeReferenceReasons(item, [...pathSegments, String(index)], problems));
        return problems;
    }

    if (!isObject(value)) {
        return problems;
    }

    Object.entries(value).forEach(([key, child]) => {
        const nextPath = [...pathSegments, key];

        if (REFERENCE_KEYS.has(key)) {
            const problem = referenceProblem(child);
            if (problem) {
                const fieldPath = joinFieldPath(nextPath);
                problems.push(reason("unsafe-reference", `unsafe reference at ${fieldPath}: ${problem}`, fieldPath));
            }
        }

        collectUnsafeReferenceReasons(child, nextPath, problems);
    });

    return problems;
}

export function validateResumeDocument(document) {
    const reasons = [];
    let identityValid = true;

    if (!isObject(document)) {
        return {
            state: "blocked",
            reasons: [reason("non-object-json", "Resume document JSON must be an object")],
            identityValid: false
        };
    }

    if (document.id !== RESUME_DOCUMENT_ID) {
        identityValid = false;
        reasons.push(reason("invalid-resume-id", "Resume singleton id must be resume-main", "id"));
    }

    if (document.type !== "resume") {
        identityValid = false;
        reasons.push(reason("invalid-resume-type", "Resume singleton type must be resume", "type"));
    }

    if (!VALID_RESUME_STATUSES.has(document.status)) {
        identityValid = false;
        reasons.push(reason("invalid-resume-status", "Resume status must be draft, published, or archived", "status"));
    }

    const translations = isObject(document.translations) ? document.translations : null;
    if (!translations || !isObject(translations.it)) {
        reasons.push(reason("missing-translation", "missing it translation", "translations.it"));
    }

    if (!translations || !isObject(translations.en)) {
        reasons.push(reason("missing-translation", "missing en translation", "translations.en"));
    }

    reasons.push(...collectUnsafeReferenceReasons(document));

    if (reasons.length > 0) {
        return {
            state: "blocked",
            reasons,
            identityValid
        };
    }

    return {
        state: document.status === "draft" ? "ready" : document.status,
        reasons: [],
        identityValid
    };
}

function safeReadErrorDetail(error) {
    if (error && error.code === "EACCES") {
        return "Resume document cannot be read because filesystem permissions denied access";
    }

    if (error && error.code === "EISDIR") {
        return "Resume document cannot be read because the configured path is a directory";
    }

    return "Resume document cannot be read";
}

async function readJsonFile(filePath) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return { ok: true, document: JSON.parse(raw) };
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return { ok: false, model: degraded("documents/resume-main.json is missing; create the private Resume document before inspection") };
        }

        if (error instanceof SyntaxError) {
            return { ok: false, model: blocked("Resume document JSON is malformed and cannot be parsed", "malformed-json", RESUME_DOCUMENT_RELATIVE_PATH.replaceAll(path.sep, ".")) };
        }

        return { ok: false, model: blocked(safeReadErrorDetail(error), "resume-document-read-blocked", RESUME_DOCUMENT_RELATIVE_PATH.replaceAll(path.sep, ".")) };
    }
}

export async function evaluateResumeDocumentReadModel(config = {}) {
    const resumePath = await resolveResumeDocumentPath(config);
    if (isObject(resumePath) && resumePath.state) {
        return resumePath;
    }

    const readResult = await readJsonFile(resumePath);
    if (!readResult.ok) {
        return readResult.model;
    }

    const { document } = readResult;
    if (!isObject(document)) {
        return blocked("Resume document JSON must be an object", "non-object-json", RESUME_DOCUMENT_RELATIVE_PATH.replaceAll(path.sep, "."));
    }

    const validation = validateResumeDocument(document);
    const successfulRead = validation.state !== "blocked";
    const canExposeDocument = validation.identityValid;
    const readModel = {
        statusCode: successfulRead ? 200 : 422,
        state: validation.state,
        reason: successfulRead
            ? "Resume document loaded from private content root in read-only mode"
            : validation.reasons.map((item) => item.detail).join("; "),
        validation,
        document: canExposeDocument ? document : undefined
    };

    if (readModel.document) {
        readModel.readiness = evaluateResumeReadiness(readModel);
    }

    return readModel;
}
