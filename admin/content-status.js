export const EDITORIAL_AREAS = ["resume", "blog", "resources"];
export const EDITORIAL_COUNT_KEYS = ["draft", "ready", "published", "blocked"];

const AREA_LABELS = {
    resume: "Resume",
    blog: "Blog",
    resources: "Resources"
};
const BLOG_TYPES = new Set(["blog", "blogPost"]);
const REFERENCE_KEYS = new Set(["href", "externalUrl", "asset", "assetRef"]);
const SAFE_REFERENCE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function emptyCounts() {
    return { draft: 0, ready: 0, published: 0, blocked: 0 };
}

export function createEmptyEditorialAreas() {
    return EDITORIAL_AREAS.map((key) => ({
        key,
        label: AREA_LABELS[key],
        counts: emptyCounts()
    }));
}

export function createEmptyEditorialSummary(status = "connected", detail = "editorial summary ready", diagnostics = []) {
    return {
        status,
        detail,
        areas: createEmptyEditorialAreas(),
        diagnostics
    };
}

function diagnostic(level, code, detail, area = "system") {
    return { level, code, detail, area };
}

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function areaForType(type) {
    if (type === "resume") {
        return "resume";
    }

    if (BLOG_TYPES.has(type)) {
        return "blog";
    }

    if (type === "resource") {
        return "resources";
    }

    return "unknown";
}

function translationReasons(document) {
    const reasons = [];
    const translations = isObject(document.translations) ? document.translations : null;

    if (!translations || !isObject(translations.it)) {
        reasons.push("missing it translation");
    }

    if (!translations || !isObject(translations.en)) {
        reasons.push("missing en translation");
    }

    return reasons;
}

function isPrivateReference(value) {
    return /(^|\/)(?:\.\.|secrets?|credentials?|private|drafts?|admin)(?:\/|$)|^\/(?:home|var|etc|tmp|usr|opt|srv|root)(?:\/|$)|^[a-z]:[\\/]/i.test(value);
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

    if (trimmedValue.startsWith("//")) {
        return "unsafe reference uses a protocol-relative URL";
    }

    if (isPrivateReference(trimmedValue)) {
        return "unsafe reference points to a private, draft, admin, or traversal path";
    }

    const schemeMatch = trimmedValue.match(/^([a-z][a-z0-9+.-]*):/i);
    if (schemeMatch) {
        const scheme = `${schemeMatch[1].toLowerCase()}:`;
        if (!SAFE_REFERENCE_SCHEMES.has(scheme)) {
            return `unsafe reference uses ${scheme} scheme`;
        }
    }

    return null;
}

function collectReferenceProblems(value, problems = []) {
    if (Array.isArray(value)) {
        value.forEach((item) => collectReferenceProblems(item, problems));
        return problems;
    }

    if (!isObject(value)) {
        return problems;
    }

    Object.entries(value).forEach(([key, child]) => {
        if (REFERENCE_KEYS.has(key)) {
            const problem = referenceProblem(child);
            if (problem) {
                problems.push(problem);
            }
        }

        collectReferenceProblems(child, problems);
    });

    return problems;
}

function addDiagnostic(diagnostics, level, code, detail, area) {
    diagnostics.push(diagnostic(level, code, detail, area));
}

export function classifyEditorialDocument(document, diagnostics = []) {
    if (!isObject(document)) {
        addDiagnostic(diagnostics, "blocked", "non-object-json", "non-object JSON document ignored");
        return null;
    }

    const area = areaForType(document.type);

    if (document.status === "archived") {
        addDiagnostic(diagnostics, "warning", "archived-document", "archived document ignored", area);
        return null;
    }

    if (area === "unknown") {
        addDiagnostic(diagnostics, "warning", "unknown-document-type", "unknown document type ignored");
        return null;
    }

    const status = typeof document.status === "string" ? document.status : "draft";
    const reasons = [
        ...translationReasons(document),
        ...collectReferenceProblems(document)
    ];
    const blocked = reasons.length > 0;

    if (blocked) {
        reasons.forEach((reasonText) => addDiagnostic(
            diagnostics,
            "blocked",
            reasonText.startsWith("missing") ? "missing-translation" : "unsafe-reference",
            reasonText,
            area
        ));
    }

    return {
        area,
        status,
        blocked,
        reasons
    };
}

export function applyDocumentClassification(summary, classification) {
    if (!classification) {
        return summary;
    }

    const area = summary.areas.find((item) => item.key === classification.area);
    if (!area) {
        return summary;
    }

    if (classification.status === "published" && !classification.blocked) {
        area.counts.published += 1;
        return summary;
    }

    if (classification.status === "draft") {
        area.counts.draft += 1;

        if (classification.blocked) {
            area.counts.blocked += 1;
        } else {
            area.counts.ready += 1;
        }

        return summary;
    }

    if (classification.blocked) {
        area.counts.blocked += 1;
    }

    return summary;
}
