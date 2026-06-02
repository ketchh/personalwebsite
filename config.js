window.PORTFOLIO_CONFIG = (function () {
    const PATCH_GRANULARITY_FALLBACK = {
        line: { short: "line", long: "line by line" },
        word: { short: "word", long: "word by word" },
        char: { short: "char", long: "letter by letter" }
    };

    const PATCH_DIRECTION_FALLBACK = {
        forward: { short: "forward", long: "from start to end" },
        reverse: { short: "reverse", long: "from end to start" }
    };

    const PATCH_STREAM_CONFIG = {
        line: { stepDelay: 120, holdDelay: 110, groupStagger: 46, groupPause: 80 },
        word: { stepDelay: 38, holdDelay: 80, groupStagger: 28, groupPause: 70 },
        char: { stepDelay: 12, holdDelay: 60, groupStagger: 18, groupPause: 60 }
    };

    const PATCH_SPEED_PRESET_FALLBACK = {
        1: { short: "fast", long: "faster", multiplier: 0.7 },
        2: { short: "normal", long: "normal speed", multiplier: 1 },
        3: { short: "slow", long: "slower", multiplier: 1.5 },
        4: { short: "very slow", long: "much slower", multiplier: 2.2 }
    };

    const INTRO_DEFAULTS = {
        greeting: "hello",
        wordsList: [
            " world", " anon", " user", " stranger", " admin",
            " system", " friend", " guest", " entity",
            " neo", " pilot", " ghost", " shell"
        ],
        typingSpeed: 150,
        deletingSpeed: 75,
        pauseTime: 1000,
        restartDelay: 500,
        initialDelay: 700,
        arrowRevealDelay: 1400,
        hintRevealDelay: 1400,
        choicesRevealDelay: 1700
    };

    const SUMMARY_SECTION_FALLBACK = {
        path: "./summary",
        number: "01",
        title: "Summary"
    };

    const HOME_ENTER_TRANSITION = {
        studyFrameRevealMs: 500,
        frameRevealMs: 350,
        clearingMs: 90,
        outlineRevealMs: 260,
        textGranularity: "char",
        textStepDelayMs: 3,
        textHoldDelayMs: 12,
        textGroupStaggerMs: 14,
        textGroupPauseMs: 34,
        headingGranularity: "char",
        copyGranularity: "word",
        direction: "forward"
    };

    const PAGE_RAIL_TRANSITION = {
        exitMs: 120,
        enterMs: 170,
        travelPx: 32
    };

    const BROWSER_ENTRY_TRANSITION = {
        manualReferenceMs: 240,
        entryMs: 120,
        pageGranularity: "word",
        direction: "forward",
        homeCharDelayMs: 12,
        choiceStaggerMs: 18
    };

    const SITE_RELEASE = {
        version: "0.1.0",
        label: "0.1",
        date: "2026-04-24",
        channel: "production-ready"
    };

    function warn(message, details) {
        if (typeof console === "undefined" || typeof console.warn !== "function") {
            return;
        }

        if (typeof details === "undefined") {
            console.warn(`[portfolio] ${message}`);
            return;
        }

        console.warn(`[portfolio] ${message}`, details);
    }

    function getValidLanguageKey(source, requestedKey) {
        if (!source || !source.languages || typeof source.languages !== "object") {
            warn("Missing languages object in PORTFOLIO_CONTENT.");
            return "";
        }

        if (requestedKey && source.languages[requestedKey]) {
            return requestedKey;
        }

        const fallbackKey = source.defaultLanguage && source.languages[source.defaultLanguage]
            ? source.defaultLanguage
            : Object.keys(source.languages)[0];

        if (!fallbackKey) {
            warn("No valid language entries found in PORTFOLIO_CONTENT.");
            return "";
        }

        if (requestedKey && requestedKey !== fallbackKey) {
            warn(`Missing language \"${requestedKey}\", falling back to \"${fallbackKey}\".`);
        }

        return fallbackKey;
    }

    function validateLanguageShape(languageKey, data) {
        if (!data || typeof data !== "object") {
            warn(`Language \"${languageKey}\" is missing or invalid.`);
            return false;
        }

        const missingSections = [];

        if (!data.ui || typeof data.ui !== "object") {
            missingSections.push("ui");
        }

        if (!data.hero || typeof data.hero !== "object") {
            missingSections.push("hero");
        }

        if (!Array.isArray(data.facts)) {
            missingSections.push("facts");
        }

        if (!Array.isArray(data.panels)) {
            missingSections.push("panels");
        }

        if (missingSections.length) {
            warn(`Language \"${languageKey}\" is missing required sections: ${missingSections.join(", ")}.`);
            return false;
        }

        return true;
    }

    function validateRenderableTransition(fromFields, toFields, fromLang, toLang) {
        if (fromFields.length !== toFields.length) {
            warn(`Renderable field count mismatch between \"${fromLang}\" (${fromFields.length}) and \"${toLang}\" (${toFields.length}).`);
            return false;
        }

        for (let index = 0; index < fromFields.length; index += 1) {
            if (fromFields[index].key !== toFields[index].key) {
                warn(
                    `Renderable field key mismatch at index ${index} between \"${fromLang}\" and \"${toLang}\".`,
                    { from: fromFields[index].key, to: toFields[index].key }
                );
                return false;
            }
        }

        return true;
    }

    function warnMissingPatchElement(key) {
        warn(`Missing patch target element for key \"${key}\".`);
    }

    function createIntroConfig(introSource) {
        const source = introSource && typeof introSource === "object" ? introSource : {};
        const wordsList = Array.isArray(source.wordsList) && source.wordsList.length
            ? source.wordsList.slice()
            : INTRO_DEFAULTS.wordsList.slice();

        return {
            ...INTRO_DEFAULTS,
            ...source,
            greeting: typeof source.greeting === "string" ? source.greeting : INTRO_DEFAULTS.greeting,
            wordsList
        };
    }

    return {
        patchGranularityFallback: PATCH_GRANULARITY_FALLBACK,
        patchDirectionFallback: PATCH_DIRECTION_FALLBACK,
        patchStreamConfig: PATCH_STREAM_CONFIG,
        patchSpeedPresetFallback: PATCH_SPEED_PRESET_FALLBACK,
        introDefaults: INTRO_DEFAULTS,
        summarySectionFallback: SUMMARY_SECTION_FALLBACK,
        homeEnterTransition: HOME_ENTER_TRANSITION,
        pageRailTransition: PAGE_RAIL_TRANSITION,
        browserEntryTransition: BROWSER_ENTRY_TRANSITION,
        siteRelease: SITE_RELEASE,
        createIntroConfig,
        getValidLanguageKey,
        validateLanguageShape,
        validateRenderableTransition,
        warnMissingPatchElement
    };
})();