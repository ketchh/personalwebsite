const CHECK_KEYS = {
    itTranslation: "it-translation",
    enTranslation: "en-translation",
    localizedFieldCompleteness: "localized-field-completeness",
    renderableFieldParity: "renderable-field-parity",
    safeReferences: "safe-references",
    publishGuardrails: "publish-guardrails"
};

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueKind(value) {
    if (Array.isArray(value)) {
        return "array";
    }

    if (value === null) {
        return "null";
    }

    if (isObject(value)) {
        return "object";
    }

    return typeof value;
}

function objectKeys(value) {
    return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

function fieldPath(basePath, key) {
    return basePath ? `${basePath}.${key}` : key;
}

function indexPath(basePath, index) {
    return `${basePath}[${index}]`;
}

function diagnostic(code, path, detail, extra = {}) {
    return { code, path, detail, ...extra };
}

function collectLeafPaths(value, basePath = "", paths = []) {
    const kind = valueKind(value);

    if (kind === "object") {
        const keys = objectKeys(value);
        if (!keys.length && basePath) {
            paths.push(basePath);
        }
        keys.forEach((key) => collectLeafPaths(value[key], fieldPath(basePath, key), paths));
        return paths;
    }

    if (kind === "array") {
        if (!value.length && basePath) {
            paths.push(basePath);
        }
        value.forEach((item, index) => collectLeafPaths(item, indexPath(basePath, index), paths));
        return paths;
    }

    if (basePath) {
        paths.push(basePath);
    }

    return paths;
}

function collectBlankStringDiagnostics(value, language, basePath = "", diagnostics = []) {
    const kind = valueKind(value);

    if (kind === "object") {
        objectKeys(value).forEach((key) => collectBlankStringDiagnostics(value[key], language, fieldPath(basePath, key), diagnostics));
        return diagnostics;
    }

    if (kind === "array") {
        value.forEach((item, index) => collectBlankStringDiagnostics(item, language, indexPath(basePath, index), diagnostics));
        return diagnostics;
    }

    if (kind === "string" && !value.trim()) {
        diagnostics.push(diagnostic(
            "blank-string",
            basePath || "translation",
            `${language.toUpperCase()} localized field is blank`,
            { language }
        ));
    }

    return diagnostics;
}

function pushMissingDiagnostics({ diagnostics, code, value, path }) {
    const leaves = collectLeafPaths(value, path);
    const nextLeaves = leaves.length ? leaves : [path];

    nextLeaves.forEach((leafPath) => {
        diagnostics.push(diagnostic(code, leafPath, `${leafPath} is missing from ${code === "missing-in-en" ? "EN" : "IT"} translation`));
    });
}

function compareRenderableNodes(itValue, enValue, basePath, diagnostics) {
    const itKind = valueKind(itValue);
    const enKind = valueKind(enValue);

    if (itKind !== enKind) {
        diagnostics.push(diagnostic(
            "incompatible-kind",
            basePath,
            `${basePath} has incompatible renderable value kinds`,
            { expectedKind: itKind, actualKind: enKind }
        ));
        return;
    }

    if (itKind === "object") {
        const itKeys = new Set(objectKeys(itValue));
        const enKeys = new Set(objectKeys(enValue));
        const allKeys = [...new Set([...itKeys, ...enKeys])].sort((left, right) => left.localeCompare(right));

        allKeys.forEach((key) => {
            const nextPath = fieldPath(basePath, key);
            const hasIt = itKeys.has(key);
            const hasEn = enKeys.has(key);

            if (!hasEn) {
                pushMissingDiagnostics({ diagnostics, code: "missing-in-en", value: itValue[key], path: nextPath });
                return;
            }

            if (!hasIt) {
                pushMissingDiagnostics({ diagnostics, code: "missing-in-it", value: enValue[key], path: nextPath });
                return;
            }

            compareRenderableNodes(itValue[key], enValue[key], nextPath, diagnostics);
        });
        return;
    }

    if (itKind === "array") {
        const minLength = Math.min(itValue.length, enValue.length);

        for (let index = 0; index < minLength; index += 1) {
            compareRenderableNodes(itValue[index], enValue[index], indexPath(basePath, index), diagnostics);
        }

        if (itValue.length > enValue.length) {
            for (let index = enValue.length; index < itValue.length; index += 1) {
                pushMissingDiagnostics({ diagnostics, code: "missing-in-en", value: itValue[index], path: indexPath(basePath, index) });
            }
        }

        if (enValue.length > itValue.length) {
            for (let index = itValue.length; index < enValue.length; index += 1) {
                pushMissingDiagnostics({ diagnostics, code: "missing-in-it", value: enValue[index], path: indexPath(basePath, index) });
            }
        }
    }
}

function evaluateRenderableFieldParity(translations) {
    const diagnostics = [];
    const itTranslation = isObject(translations && translations.it) ? translations.it : null;
    const enTranslation = isObject(translations && translations.en) ? translations.en : null;
    const itFieldPaths = itTranslation ? collectLeafPaths(itTranslation) : [];
    const enFieldPaths = enTranslation ? collectLeafPaths(enTranslation) : [];

    if (itTranslation && enTranslation) {
        compareRenderableNodes(itTranslation, enTranslation, "", diagnostics);
    } else if (itTranslation && !enTranslation) {
        pushMissingDiagnostics({ diagnostics, code: "missing-in-en", value: itTranslation, path: "" });
    } else if (!itTranslation && enTranslation) {
        pushMissingDiagnostics({ diagnostics, code: "missing-in-it", value: enTranslation, path: "" });
    }

    return {
        state: diagnostics.length ? "blocked" : "ready",
        itFieldPaths,
        enFieldPaths,
        diagnostics
    };
}

function check(key, label, state, detail, diagnostics = []) {
    return { key, label, state, detail, diagnostics };
}

function validationDiagnostics(readModel, code) {
    const reasons = readModel && readModel.validation && Array.isArray(readModel.validation.reasons)
        ? readModel.validation.reasons
        : [];

    return reasons
        .filter((item) => item && item.code === code)
        .map((item) => diagnostic(item.code, item.path || "document", item.detail || item.code));
}

export function evaluateResumeReadiness(readModel = {}) {
    const document = readModel.document;
    const translations = isObject(document && document.translations) ? document.translations : null;
    const hasIt = Boolean(translations && isObject(translations.it));
    const hasEn = Boolean(translations && isObject(translations.en));
    const unsafeDiagnostics = validationDiagnostics(readModel, "unsafe-reference");
    const missingTranslationDiagnostics = validationDiagnostics(readModel, "missing-translation");
    const blankDiagnostics = [
        ...(hasIt ? collectBlankStringDiagnostics(translations.it, "it") : []),
        ...(hasEn ? collectBlankStringDiagnostics(translations.en, "en") : [])
    ];
    const renderableFieldParity = evaluateRenderableFieldParity(translations || {});
    const parityDiagnostics = renderableFieldParity.diagnostics;

    const checks = [
        check(
            CHECK_KEYS.itTranslation,
            "IT translation present",
            hasIt ? "passed" : "failed",
            hasIt ? "Italian translation object is present." : "Italian translation object is missing or invalid.",
            hasIt ? [] : missingTranslationDiagnostics.filter((item) => item.path === "translations.it")
        ),
        check(
            CHECK_KEYS.enTranslation,
            "EN translation present",
            hasEn ? "passed" : "failed",
            hasEn ? "English translation object is present." : "English translation object is missing or invalid.",
            hasEn ? [] : missingTranslationDiagnostics.filter((item) => item.path === "translations.en")
        ),
        check(
            CHECK_KEYS.localizedFieldCompleteness,
            "Localized field completeness",
            blankDiagnostics.length ? "failed" : "passed",
            blankDiagnostics.length
                ? "One or more localized string fields are blank."
                : "Present localized string fields are nonblank.",
            blankDiagnostics
        ),
        check(
            CHECK_KEYS.renderableFieldParity,
            "Renderable IT/EN field parity",
            parityDiagnostics.length ? "failed" : "passed",
            parityDiagnostics.length
                ? "IT and EN renderable fields do not have the same deterministic shape."
                : "IT and EN renderable fields have matching deterministic shape.",
            parityDiagnostics
        ),
        check(
            CHECK_KEYS.safeReferences,
            "Safe public references",
            unsafeDiagnostics.length ? "failed" : "passed",
            unsafeDiagnostics.length
                ? "Existing unsafe-reference validation blocks future publication."
                : "Existing safe-reference validation found no unsafe references.",
            unsafeDiagnostics
        ),
        check(
            CHECK_KEYS.publishGuardrails,
            "Publish guardrails locked",
            "locked",
            "Publish, preview, save draft, unpublish, upload, export, and public manifest writes remain locked in this read-only slice."
        )
    ];

    const contentBlocked = checks.some((item) => item.state === "failed");

    return {
        writeEnabled: false,
        publishEnabled: false,
        state: contentBlocked ? "blocked" : "ready-but-locked",
        reason: contentBlocked
            ? "Resume content readiness is blocked by read-only diagnostics; publishing remains locked."
            : "Resume content has renderable IT/EN parity for a future publish flow, but publishing remains locked.",
        checks,
        renderableFieldParity
    };
}
