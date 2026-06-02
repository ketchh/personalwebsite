import { createBootlineController } from "./app/bootline.js?v=20260601-3";
import { applyLanguagePatchState, buildShellNavigationFields, createControlsController, syncShellNavigation } from "./app/controls.js?v=20260601-3";
import { loadPublishedContent } from "./app/content-loader.js?v=20260601-3";
import { createIntroController } from "./app/intro.js?v=20260601-3";
import { createPatchEngine } from "./app/patch-engine.js?v=20260601-3";
import { createRenderer } from "./app/render.js?v=20260601-3";

(async function () {
    const runtimeConfig = window.PORTFOLIO_CONFIG;

    if (!runtimeConfig) {
        return;
    }

    function getCurrentView() {
        const hash = window.location.hash.replace(/^#\/?/, "").split("/")[0];

        if (hash === "resume" || hash === "blog" || hash === "resources") {
            return hash;
        }

        return "home";
    }

    const refs = {
        introPrefix: document.getElementById("site-intro-prefix"),
        introTypingArea: document.getElementById("site-intro-typing"),
        introHint: document.getElementById("intro-hint"),
        introChoices: document.getElementById("intro-choices"),
        resumeShell: document.getElementById("resume-shell"),
        app: document.getElementById("resume-app"),
        languageStatus: document.getElementById("language-status"),
        languagePopup: document.getElementById("language-popup"),
        languageMenu: document.getElementById("language-menu"),
        langSwitch: document.querySelector("[data-language-globe]"),
        languageGlobe: document.getElementById("language-globe"),
        languageGlobeCurrent: document.getElementById("language-globe-current"),
        languageGlobes: Array.from(document.querySelectorAll("[data-language-globe]")),
        languageGlobeCurrents: Array.from(document.querySelectorAll("[data-language-globe-current]")),
        navLinks: Array.from(document.querySelectorAll('[data-shell-nav="sections"] [data-section]')),
        heroCommand: document.getElementById("hero-command"),
        patchSelectorLabel: document.getElementById("patch-selector-label"),
        patchDirectionLabel: document.getElementById("patch-direction-label"),
        patchSpeedLabel: document.getElementById("patch-speed-label"),
        patchSpeedSlider: document.getElementById("patch-speed-slider"),
        patchSpeedValue: document.getElementById("patch-speed-value"),
        statusLeft: document.getElementById("status-left"),
        statusRight: document.getElementById("status-right"),
        langButtons: Array.from(document.querySelectorAll(".lang-button")),
        languageMenuButtons: Array.from(document.querySelectorAll("[data-language-option]")),
        patchGranularityButtons: Array.from(document.querySelectorAll(".patch-granularity-button")),
        patchDirectionButtons: Array.from(document.querySelectorAll(".patch-direction-button"))
    };

    const renderer = createRenderer({
        app: refs.app,
        summarySectionFallback: runtimeConfig.summarySectionFallback,
        getCurrentView
    });

    const loadResult = await loadPublishedContent();

    if (!loadResult.ok || !loadResult.source || !loadResult.source.languages) {
        syncCurrentSection("content-error");
        showContentErrorState(loadResult.error || new Error("data/published.json did not return public content."));

        if (refs.statusLeft) {
            refs.statusLeft.textContent = "[F1] resume [F2] blog [F3] resources";
        }

        if (refs.statusRight) {
            refs.statusRight.textContent = "published.json::unavailable";
        }

        return;
    }

    const source = loadResult.source;
    const availableLanguages = Object.keys(source.languages);

    if (!availableLanguages.length) {
        showContentErrorState(new Error("data/published.json has no public language entries."));
        return;
    }

    availableLanguages.forEach((langKey) => {
        runtimeConfig.validateLanguageShape(langKey, source.languages[langKey]);
    });

    const resolveLanguageKey = (requestedKey, fallbackKey) => {
        const requested = runtimeConfig.getValidLanguageKey(source, requestedKey);

        if (requested) {
            return requested;
        }

        if (fallbackKey) {
            return runtimeConfig.getValidLanguageKey(source, fallbackKey);
        }

        return availableLanguages[0] || "";
    };

    const initialLanguageKey = resolveLanguageKey(source.defaultLanguage || "it");

    if (!initialLanguageKey) {
        showContentErrorState(new Error("data/published.json has no valid default language."));
        return;
    }

    const state = {
        currentLang: initialLanguageKey,
        isPatching: false,
        isRouteTransitioning: false,
        browserEntryCompleted: false,
        typingToken: 0,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3",
        languagePatchState: "idle"
    };

    function getLanguageEntry(requestedKey, fallbackKey) {
        const resolvedKey = resolveLanguageKey(requestedKey, fallbackKey || state.currentLang || initialLanguageKey);

        return {
            key: resolvedKey,
            data: resolvedKey ? source.languages[resolvedKey] : null
        };
    }

    function syncCurrentSection(forcedSection) {
        const section = forcedSection || getCurrentView();

        if (document.body) {
            document.body.dataset.currentSection = section;
            document.body.setAttribute("data-current-section", section);
        }

        if (refs.resumeShell) {
            refs.resumeShell.dataset.currentSection = section;
            refs.resumeShell.setAttribute("data-current-section", section);
            refs.resumeShell.setAttribute("data-section-accent", section);
        }

        if (refs.app) {
            refs.app.dataset.currentSection = section;
            refs.app.setAttribute("data-current-section", section);
        }

        return section;
    }

    function showContentErrorState(error) {
        syncCurrentSection("content-error");
        renderer.renderContentError(error);
    }

    function getVisibleCurrentSection() {
        if (refs.resumeShell && refs.resumeShell.dataset && refs.resumeShell.dataset.currentSection) {
            return refs.resumeShell.dataset.currentSection;
        }

        if (document.body && document.body.dataset && document.body.dataset.currentSection) {
            return document.body.dataset.currentSection;
        }

        return getCurrentView();
    }

    function syncChromeInteractivity() {
        const entry = getLanguageEntry(state.currentLang);

        if (entry.data) {
            syncShellNavigation({ navLinks: refs.navLinks }, entry.data, getVisibleCurrentSection());
            controls.syncUi(entry.data);
        }
    }

    function setRouteTransitionState(name, phase) {
        const transitionName = name || "idle";
        const transitionPhase = phase || "idle";

        if (document.body) {
            document.body.setAttribute("data-route-transition", transitionName);
            document.body.setAttribute("data-route-phase", transitionPhase);
        }

        if (refs.resumeShell) {
            refs.resumeShell.setAttribute("data-route-transition", transitionName);
            refs.resumeShell.setAttribute("data-route-phase", transitionPhase);
        }

        syncChromeInteractivity();
    }

    function setLanguageEntryState(name, phase) {
        const entryName = name || "idle";
        const entryPhase = phase || "idle";

        if (document.body) {
            document.body.setAttribute("data-language-entry", entryName);
            document.body.setAttribute("data-language-entry-phase", entryPhase);
        }

        if (refs.resumeShell) {
            refs.resumeShell.setAttribute("data-language-entry", entryName);
            refs.resumeShell.setAttribute("data-language-entry-phase", entryPhase);
        }

        syncChromeInteractivity();
    }

    function getBrowserTargetLanguage() {
        const browserLanguages = [];

        if (typeof navigator !== "undefined") {
            if (Array.isArray(navigator.languages)) {
                browserLanguages.push(...navigator.languages);
            }

            if (navigator.language) {
                browserLanguages.push(navigator.language);
            }
        }

        const normalized = browserLanguages
            .filter(Boolean)
            .map((language) => String(language).trim().toLowerCase());

        for (const language of normalized) {
            const directMatch = availableLanguages.find((key) => language === key || language.startsWith(`${key}-`));

            if (directMatch) {
                return directMatch;
            }
        }

        return availableLanguages.includes("en") ? "en" : initialLanguageKey;
    }

    function focusRenderedRoute() {
        if (!refs.app || getCurrentView() === "home") {
            return;
        }

        const focusTarget = refs.app.querySelector("[data-route-heading]") || refs.app.querySelector("[data-current-section]");

        if (focusTarget && typeof focusTarget.focus === "function") {
            try {
                focusTarget.focus({ preventScroll: true });
            } catch {
                focusTarget.focus();
            }
        }
    }

    const controls = createControlsController({
        refs: {
            patchSelectorLabel: refs.patchSelectorLabel,
            patchDirectionLabel: refs.patchDirectionLabel,
            patchSpeedLabel: refs.patchSpeedLabel,
            patchSpeedSlider: refs.patchSpeedSlider,
            patchSpeedValue: refs.patchSpeedValue,
            statusRight: refs.statusRight,
            langButtons: refs.langButtons,
            languageGlobe: refs.languageGlobe,
            languageGlobeCurrent: refs.languageGlobeCurrent,
            languageMenu: refs.languageMenu,
            languageMenuButtons: refs.languageMenuButtons,
            patchGranularityButtons: refs.patchGranularityButtons,
            patchDirectionButtons: refs.patchDirectionButtons
        },
        state,
        source,
        runtimeConfig
    });

    const intro = createIntroController({
        refs: {
            prefix: refs.introPrefix,
            typingArea: refs.introTypingArea,
            hint: refs.introHint,
            choices: refs.introChoices
        },
        introConfig: runtimeConfig.createIntroConfig(source.introSite || {})
    });

    const bootline = createBootlineController(refs.heroCommand, state);

    function setLanguagePatchState(phase, details) {
        applyLanguagePatchState(
            {
                langSwitch: refs.langSwitch,
                languageGlobe: refs.languageGlobe,
                languageGlobeCurrent: refs.languageGlobeCurrent,
                languageMenu: refs.languageMenu,
                languageMenuButtons: refs.languageMenuButtons,
                languageStatus: refs.languageStatus,
                languagePopup: refs.languagePopup,
                statusRight: refs.statusRight,
                langButtons: refs.langButtons,
                patchScope: refs.resumeShell
            },
            state,
            phase,
            details
        );
    }

    function applyUiText(data) {
        const ui = data.ui || {};
        const hero = data.hero || {};
        const release = runtimeConfig.siteRelease || { version: "0.1.0", label: "0.1" };

        document.documentElement.lang = data.htmlLang || state.currentLang;
        document.title = `${hero.name || "Portfolio"} | sbar.si`;
        document.documentElement.setAttribute("data-site-version", release.version);
        document.documentElement.setAttribute("data-site-release", release.label);
        if (refs.statusLeft) {
            refs.statusLeft.textContent = ui.statusLeft || "";
        }

        syncShellNavigation({ navLinks: refs.navLinks }, data, getCurrentView());
        intro.updateUi({
            ...ui,
            sectionChoices: Array.isArray(data.sectionChooser && data.sectionChooser.choices) ? data.sectionChooser.choices : []
        });
        controls.syncUi(data);
        bootline.typeCommand(ui.heroCommand || "cat resume");
    }

    const patchEngine = createPatchEngine({
        app: refs.app,
        state,
        getLanguageEntry,
        validateLanguageShape: runtimeConfig.validateLanguageShape,
        validateRenderableTransition: runtimeConfig.validateRenderableTransition,
        warnMissingPatchElement: runtimeConfig.warnMissingPatchElement,
        statusRight: refs.statusRight,
        getGranularityLabels: controls.getGranularityLabels,
        getDirectionLabels: controls.getDirectionLabels,
        getSpeedPreset: controls.getSpeedPreset,
        getTimingConfig: controls.getTimingConfig,
        buildRenderableFields: renderer.buildRenderableFields,
        buildChromeFields: buildShellNavigationFields,
        queryPatchElement: (key) => {
            const selector = `[data-patch-key="${key}"]`;

            if (refs.resumeShell && typeof refs.resumeShell.querySelector === "function") {
                const target = refs.resumeShell.querySelector(selector);

                if (target) {
                    return target;
                }
            }

            return refs.app && typeof refs.app.querySelector === "function"
                ? refs.app.querySelector(selector)
                : null;
        },
        renderApp: renderer.renderApp,
        renderContentError: renderer.renderContentError,
        renderHomeEnterFrame: renderer.renderHomeEnterFrame,
        renderPageRailFrame: renderer.renderPageRailFrame,
        applyUiText,
        setGroupPatchState: renderer.setGroupPatchState,
        getCurrentView,
        syncCurrentSection,
        setRouteTransitionState,
        setLanguageEntryState,
        getHomeEnterTimingConfig: () => runtimeConfig.homeEnterTransition,
        getPageRailTimingConfig: () => runtimeConfig.pageRailTransition,
        getBrowserEntryTimingConfig: () => runtimeConfig.browserEntryTransition,
        getHomeEnterRevealPayload: renderer.getHomeEnterRevealPayload,
        runHomeBrowserEntryPatch: intro.runBrowserEntryPatch,
        setRouteHash: (targetView) => {
            const targetHash = `#/${targetView}`;
            if (window.location.hash !== targetHash) {
                window.location.hash = targetHash;
            }
        },
        setLanguagePatchState
    });

    controls.bind({
        onLanguageChange: (nextLang, options) => {
            patchEngine.runPatch(nextLang, options || {});
        }
    });

    if (refs.introChoices) {
        refs.introChoices.addEventListener("click", (event) => {
            const target = event.target;
            const link = target && typeof target.closest === "function"
                ? target.closest("[data-section-choice]")
                : null;

            if (!link) {
                return;
            }

            if (state.isPatching || state.isRouteTransitioning) {
                event.preventDefault();
                return;
            }

            if (getCurrentView() !== "home") {
                return;
            }

            const nextView = link.dataset.sectionChoice;

            if (!nextView || nextView === "home") {
                return;
            }

            event.preventDefault();
            patchEngine.runHomeEnterTransition(nextView, { triggerElement: link });
        });
    }

    if (refs.resumeShell) {
        refs.resumeShell.addEventListener("click", (event) => {
            const target = event.target;
            const link = target && typeof target.closest === "function"
                ? target.closest("[data-section], [data-section-choice]")
                : null;

            if (!link) {
                return;
            }

            if (state.isPatching || state.isRouteTransitioning) {
                event.preventDefault();
                return;
            }

            const currentView = getCurrentView();
            const nextView = link.dataset.section || link.dataset.sectionChoice || "";

            if (currentView === "home" || !nextView || nextView === currentView) {
                return;
            }

            event.preventDefault();
            patchEngine.runPageRailTransition(nextView, { triggerElement: link });
        });
    }

    const initialData = getLanguageEntry(initialLanguageKey).data;

    if (!initialData) {
        showContentErrorState(new Error("data/published.json default language content is unavailable."));
        return;
    }

    syncCurrentSection();
    renderer.renderApp(initialData);
    applyUiText(initialData);
    setLanguagePatchState("idle", { toLang: state.currentLang });
    setRouteTransitionState("idle", "idle");
    setLanguageEntryState("idle", "idle");
    intro.init();

    patchEngine.runBrowserEntryTransition(resolveLanguageKey(getBrowserTargetLanguage(), initialLanguageKey));

    window.addEventListener("hashchange", () => {
        if (state.isRouteTransitioning) {
            return;
        }

        const entry = getLanguageEntry(state.currentLang);

        if (!entry.data) {
            return;
        }

        const targetView = getCurrentView();

        if (targetView === "home") {
            syncCurrentSection();
            renderer.renderApp(entry.data);
            applyUiText(entry.data);
            setLanguagePatchState("idle", { toLang: state.currentLang });
            setRouteTransitionState("idle", "idle");
            focusRenderedRoute();
            return;
        }

        patchEngine.runDirectEntryTransition(targetView).then(() => {
            setLanguagePatchState("idle", { toLang: state.currentLang });
            focusRenderedRoute();
        });
    });
})();
