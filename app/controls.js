function bindButtonGroup(buttons, options) {
    const datasetKey = options.datasetKey;
    const getCurrentKey = options.getCurrentKey;
    const onSelect = options.onSelect;
    const isDisabled = options.isDisabled;

    (buttons || []).forEach((button) => {
        button.addEventListener("click", () => {
            const nextKey = button.dataset[datasetKey];

            if (!nextKey || nextKey === getCurrentKey() || isDisabled()) {
                return;
            }

            onSelect(nextKey, button);
        });
    });
}

function getOptionLabels(data, uiKey, key, fallbackMap, fallbackKey) {
    const configured = data.ui[uiKey] && data.ui[uiKey][key];
    return configured || fallbackMap[key] || fallbackMap[fallbackKey];
}

const SECTION_ORDER = ["resume", "blog", "resources"];

function getSectionNavChoices(data) {
    const chooser = data && data.sectionChooser;
    const choices = Array.isArray(chooser && chooser.choices) ? chooser.choices : [];
    const byKey = new Map(choices.map((choice) => [choice && choice.key, choice || {}]));

    return SECTION_ORDER.map((key) => {
        const choice = byKey.get(key) || {};
        const fallbackLabel = key === "resume" ? "Resume" : key === "resources" ? "Resources" : "Blog";

        return {
            key,
            label: choice.label || fallbackLabel,
            path: choice.path || `#/${key}`
        };
    });
}

export function buildShellNavigationFields(data) {
    return getSectionNavChoices(data || {}).map((choice) => ({
        key: `shell-nav-${choice.key}-label`,
        text: choice.label || "",
        group: "shell-nav",
        href: choice.path || `#/${choice.key}`
    }));
}

export function syncShellNavigation(refs, data, currentView) {
    const navLinks = Array.isArray(refs && refs.navLinks) ? refs.navLinks : [];
    const navChoices = getSectionNavChoices(data || {});

    navLinks.forEach((link) => {
        const sectionKey = link && link.dataset ? link.dataset.section : "";
        const choice = navChoices.find((item) => item.key === sectionKey);
        const isCurrent = sectionKey === currentView && SECTION_ORDER.includes(currentView);

        if (!choice) {
            return;
        }

        link.textContent = choice.label;
        link.setAttribute("href", choice.path);
        link.setAttribute("data-section-accent", sectionKey);
        link.dataset.sectionAccent = sectionKey;
        link.classList.toggle("is-active", isCurrent);

        if (isCurrent) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

function syncButtonGroup(buttons, datasetKey, currentKey, getLabels) {
    buttons.forEach((button) => {
        const key = button.dataset[datasetKey];
        const labels = getLabels(key);
        const isActive = key === currentKey;

        button.textContent = labels.short;
        button.setAttribute("aria-label", labels.long);
        button.setAttribute("title", labels.long);
        button.setAttribute("aria-pressed", String(isActive));
        button.classList.toggle("is-active", isActive);
    });
}

function formatLanguagePatchStatus(phase, details, state) {
    const currentLang = String(details.toLang || state.currentLang || "it").toLowerCase();
    const fromLang = String(details.fromLang || state.currentLang || "?").toLowerCase();
    const toLang = String(details.toLang || currentLang || "?").toLowerCase();

    if (phase === "patching") {
        return `language patching ${fromLang} -> ${toLang}`;
    }

    if (phase === "complete") {
        return `language ${currentLang} patch complete`;
    }

    if (phase === "error") {
        return `language patch unavailable ${fromLang} -> ${toLang}`;
    }

    if (details.completed) {
        return `language ${currentLang} patch complete / idle`;
    }

    return `language ${currentLang} ready / idle`;
}

function formatLanguagePopup(details, state) {
    const fromLang = String(details.fromLang || state.currentLang || "IT").toUpperCase();
    const toLang = String(details.toLang || state.currentLang || "EN").toUpperCase();
    return `translating ${fromLang} → ${toLang}`;
}

function closeLanguageMenu(refs) {
    const menus = refs.languageMenus && refs.languageMenus.length
        ? refs.languageMenus
        : (refs.languageMenu ? [refs.languageMenu] : []);
    const globes = refs.languageGlobes && refs.languageGlobes.length
        ? refs.languageGlobes
        : (refs.languageGlobe ? [refs.languageGlobe] : []);

    menus.forEach((menu) => {
        menu.hidden = true;
        menu.setAttribute("hidden", "hidden");
    });

    globes.forEach((globe) => {
        globe.setAttribute("aria-expanded", "false");
    });
}

export function applyLanguagePatchState(refs, state, phase, details = {}) {
    const nextPhase = phase || "idle";
    const isPatching = nextPhase === "patching";

    state.languagePatchState = nextPhase;

    if (refs.langSwitch) {
        refs.langSwitch.dataset.patchState = nextPhase;
        refs.langSwitch.setAttribute("data-patch-state", nextPhase);
    }

    const patchStateGlobes = (refs.languageGlobes && refs.languageGlobes.length)
        ? refs.languageGlobes
        : (refs.languageGlobe ? [refs.languageGlobe] : []);
    patchStateGlobes.forEach((globe) => {
        globe.dataset.patchState = nextPhase;
        globe.setAttribute("data-patch-state", nextPhase);
        globe.setAttribute("aria-disabled", String(isPatching));
        globe.classList.toggle("is-patching", isPatching);
    });

    const patchStateGlobeCurrents = (refs.languageGlobeCurrents && refs.languageGlobeCurrents.length)
        ? refs.languageGlobeCurrents
        : (refs.languageGlobeCurrent ? [refs.languageGlobeCurrent] : []);
    patchStateGlobeCurrents.forEach((current) => {
        current.textContent = "";
        current.setAttribute("aria-hidden", "true");
    });

    if (isPatching) {
        closeLanguageMenu(refs);
    }

    if (refs.patchScope) {
        refs.patchScope.setAttribute("data-patch-scope", "page");
        refs.patchScope.setAttribute("data-patch-state", nextPhase);
    }

    if (refs.languageStatus) {
        refs.languageStatus.textContent = formatLanguagePatchStatus(nextPhase, details, state);
        refs.languageStatus.dataset.patchState = nextPhase;
        refs.languageStatus.setAttribute("data-patch-state", nextPhase);
    }

    if (refs.languagePopup) {
        refs.languagePopup.dataset.patchState = nextPhase;
        refs.languagePopup.setAttribute("data-patch-state", nextPhase);

        if (nextPhase === "patching") {
            refs.languagePopup.textContent = formatLanguagePopup(details, state);
            refs.languagePopup.hidden = false;
            refs.languagePopup.removeAttribute("hidden");
            refs.languagePopup.setAttribute("aria-hidden", "false");
        } else {
            refs.languagePopup.textContent = "";
            refs.languagePopup.hidden = true;
            refs.languagePopup.setAttribute("hidden", "hidden");
            refs.languagePopup.setAttribute("aria-hidden", "true");
        }
    }

    (refs.langButtons || []).forEach((button) => {
        const isActive = button.dataset.lang === state.currentLang;
        button.setAttribute("aria-pressed", String(isActive));
        button.setAttribute("aria-checked", String(isActive));
        button.setAttribute("aria-disabled", String(isPatching));
        button.classList.toggle("is-active", isActive);
        button.classList.toggle("is-patching", isPatching);
    });

    (refs.languageMenuButtons || []).forEach((button) => {
        const isActive = button.dataset.lang === state.currentLang;
        button.setAttribute("aria-checked", String(isActive));
        button.setAttribute("aria-disabled", String(isPatching));
        button.classList.toggle("is-active", isActive);
        button.classList.toggle("is-patching", isPatching);
    });

    if (refs.statusChip) {
        refs.statusChip.textContent = nextPhase === "patching" ? formatLanguagePopup(details, state) : "";
    }

    if (refs.statusRight && nextPhase !== "idle") {
        refs.statusRight.textContent = formatLanguagePatchStatus(nextPhase, details, state);
    }
}

export function createControlsController({ refs, state, source, runtimeConfig }) {
    function getAvailableLanguageKeys() {
        return Object.keys((source && source.languages) || {});
    }

    function getNextLanguageKey() {
        const keys = getAvailableLanguageKeys();
        const currentIndex = keys.indexOf(state.currentLang);

        if (!keys.length) {
            return state.currentLang || "";
        }

        if (currentIndex === -1) {
            return keys[0];
        }

        return keys[(currentIndex + 1) % keys.length];
    }

    function formatLanguageName(key) {
        if (key === "it") {
            return "Italiano / IT";
        }

        if (key === "en") {
            return "English / EN";
        }

        if (key === "fr") {
            return "Français / FR";
        }

        return String(key || "language").toUpperCase();
    }

    const patchGranularityFallback = runtimeConfig.patchGranularityFallback || {
        line: { short: "line", long: "line by line" },
        word: { short: "word", long: "word by word" },
        char: { short: "char", long: "letter by letter" }
    };

    const patchDirectionFallback = runtimeConfig.patchDirectionFallback || {
        forward: { short: "forward", long: "from start to end" },
        reverse: { short: "reverse", long: "from end to start" }
    };

    const patchStreamConfig = runtimeConfig.patchStreamConfig || {
        line: { stepDelay: 120, holdDelay: 110, groupStagger: 46, groupPause: 80 },
        word: { stepDelay: 38, holdDelay: 80, groupStagger: 28, groupPause: 70 },
        char: { stepDelay: 12, holdDelay: 60, groupStagger: 18, groupPause: 60 }
    };

    const patchSpeedPresetFallback = runtimeConfig.patchSpeedPresetFallback || {
        1: { short: "fast", long: "faster", multiplier: 0.7 },
        2: { short: "normal", long: "normal speed", multiplier: 1 },
        3: { short: "slow", long: "slower", multiplier: 1.5 },
        4: { short: "very slow", long: "much slower", multiplier: 2.2 }
    };

    function getCurrentData() {
        return source.languages[state.currentLang] || source.languages[source.defaultLanguage] || { ui: {} };
    }

    function isInteractionLocked() {
        return Boolean(state.isPatching || state.isRouteTransitioning);
    }

    function getGranularityLabels(data, key) {
        return getOptionLabels(data, "patchGranularity", key, patchGranularityFallback, "line");
    }

    function getDirectionLabels(data, key) {
        return getOptionLabels(data, "patchDirection", key, patchDirectionFallback, "forward");
    }

    function getSpeedPreset(data, key) {
        const configured = data.ui.patchSpeedPresets && data.ui.patchSpeedPresets[key];
        const fallback = patchSpeedPresetFallback[key] || patchSpeedPresetFallback[2];

        return {
            short: (configured && configured.short) || fallback.short,
            long: (configured && configured.long) || fallback.long,
            multiplier: fallback.multiplier
        };
    }

    function getTimingConfig(granularity) {
        const base = patchStreamConfig[granularity] || patchStreamConfig.word;
        const preset = getSpeedPreset(getCurrentData(), state.patchSpeedPreset);

        return {
            stepDelay: Math.round(base.stepDelay * preset.multiplier),
            holdDelay: Math.round(base.holdDelay * preset.multiplier),
            groupStagger: Math.round(base.groupStagger * preset.multiplier),
            groupPause: Math.round(base.groupPause * preset.multiplier)
        };
    }

    function getLanguageGlobes() {
        return (refs.languageGlobes && refs.languageGlobes.length)
            ? refs.languageGlobes
            : (refs.languageGlobe ? [refs.languageGlobe] : []);
    }

    function getLanguageGlobeCurrents() {
        return (refs.languageGlobeCurrents && refs.languageGlobeCurrents.length)
            ? refs.languageGlobeCurrents
            : (refs.languageGlobeCurrent ? [refs.languageGlobeCurrent] : []);
    }

    function getLanguageMenus() {
        return (refs.languageMenus && refs.languageMenus.length)
            ? refs.languageMenus
            : (refs.languageMenu ? [refs.languageMenu] : []);
    }

    function getLanguageMenuButtons() {
        return (refs.languageMenuButtons && refs.languageMenuButtons.length)
            ? refs.languageMenuButtons
            : (refs.langButtons || []);
    }

    function isLanguageMenuOpen() {
        return getLanguageMenus().some((menu) => !menu.hidden);
    }

    function setLanguageMenuOpen(isOpen) {
        const shouldOpen = Boolean(isOpen) && !isInteractionLocked();

        getLanguageMenus().forEach((menu) => {
            menu.hidden = !shouldOpen;
            if (shouldOpen) {
                menu.removeAttribute("hidden");
            } else {
                menu.setAttribute("hidden", "hidden");
            }
        });

        getLanguageGlobes().forEach((globe) => {
            globe.setAttribute("aria-expanded", String(shouldOpen));
        });
    }

    function syncLanguageGlobe() {
        const globes = getLanguageGlobes();

        if (!globes.length) {
            return;
        }

        const currentLang = state.currentLang || source.defaultLanguage || "it";
        const isPatching = isInteractionLocked();

        getLanguageGlobeCurrents().forEach((current) => {
            current.textContent = "";
            current.setAttribute("aria-hidden", "true");
        });

        globes.forEach((globe) => {
            globe.setAttribute("aria-label", `Choose language. Current language: ${formatLanguageName(currentLang)}`);
            globe.setAttribute("title", "Choose language");
            globe.setAttribute("aria-disabled", String(isPatching));
            globe.setAttribute("data-current-lang", currentLang);
            globe.removeAttribute("data-next-lang");
            globe.classList.toggle("is-patching", isPatching);
        });
    }

    function syncLanguageButtons() {
        const languageKeys = getAvailableLanguageKeys();
        const isPatching = isInteractionLocked();

        (refs.langButtons || []).forEach((button) => {
            const isActive = button.dataset.lang === state.currentLang;
            button.classList.toggle("is-active", isActive);
            button.classList.toggle("is-patching", isPatching);
            button.setAttribute("aria-pressed", String(isActive));
            button.setAttribute("aria-checked", String(isActive));
            button.setAttribute("aria-disabled", String(isPatching));
        });

        getLanguageMenuButtons().forEach((button) => {
            const key = button.dataset.lang;
            const isActive = key === state.currentLang;
            button.hidden = Boolean(key && !languageKeys.includes(key));
            button.classList.toggle("is-active", isActive);
            button.classList.toggle("is-patching", isPatching);
            button.setAttribute("aria-checked", String(isActive));
            button.setAttribute("aria-disabled", String(isPatching));
            button.setAttribute("title", formatLanguageName(key));
        });

        if (isPatching) {
            setLanguageMenuOpen(false);
        }
    }

    function syncUi(data) {
        const ui = data.ui || {};

        if (refs.patchSelectorLabel) {
            refs.patchSelectorLabel.textContent = ui.patchSelectorLabel || "patch mode";
        }

        if (refs.patchDirectionLabel) {
            refs.patchDirectionLabel.textContent = ui.patchDirectionLabel || "direction";
        }

        if (refs.patchSpeedLabel) {
            refs.patchSpeedLabel.textContent = ui.patchSpeedLabel || "speed";
        }

        syncButtonGroup(refs.patchGranularityButtons, "patchGranularity", state.patchGranularity, (key) =>
            getGranularityLabels(data, key)
        );
        syncButtonGroup(refs.patchDirectionButtons, "patchDirection", state.patchDirection, (key) =>
            getDirectionLabels(data, key)
        );

        const currentLabels = getGranularityLabels(data, state.patchGranularity);
        const currentDirection = getDirectionLabels(data, state.patchDirection);
        const currentSpeed = getSpeedPreset(data, state.patchSpeedPreset);

        if (refs.patchSpeedSlider) {
            refs.patchSpeedSlider.value = state.patchSpeedPreset;
            refs.patchSpeedSlider.setAttribute("aria-label", currentSpeed.long);
        }

        if (refs.patchSpeedValue) {
            refs.patchSpeedValue.textContent = currentSpeed.short;
        }

        if (refs.statusRight) {
            refs.statusRight.textContent = `${ui.statusRight || ""} / ${currentDirection.short} / ${currentLabels.short} / ${currentSpeed.short}`;
        }

        syncLanguageButtons();
        syncLanguageGlobe();
    }

    function bind(options) {
        bindButtonGroup(refs.patchGranularityButtons, {
            datasetKey: "patchGranularity",
            getCurrentKey: () => state.patchGranularity,
            isDisabled: () => isInteractionLocked(),
            onSelect: (nextGranularity) => {
                state.patchGranularity = nextGranularity;
                syncUi(getCurrentData());
            }
        });

        bindButtonGroup(refs.patchDirectionButtons, {
            datasetKey: "patchDirection",
            getCurrentKey: () => state.patchDirection,
            isDisabled: () => isInteractionLocked(),
            onSelect: (nextDirection) => {
                state.patchDirection = nextDirection;
                syncUi(getCurrentData());
            }
        });

        if (refs.patchSpeedSlider) {
            refs.patchSpeedSlider.addEventListener("input", () => {
                if (isInteractionLocked()) {
                    refs.patchSpeedSlider.value = state.patchSpeedPreset;
                    return;
                }

                state.patchSpeedPreset = refs.patchSpeedSlider.value;
                syncUi(getCurrentData());
            });
        }

        bindButtonGroup(refs.langButtons, {
            datasetKey: "lang",
            getCurrentKey: () => state.currentLang,
            isDisabled: () => isInteractionLocked(),
            onSelect: (nextLang, button) => {
                options.onLanguageChange(nextLang, { triggerElement: button });
            }
        });

        getLanguageGlobes().forEach((globe) => {
            globe.addEventListener("click", () => {
                if (isInteractionLocked()) {
                    return;
                }

                setLanguageMenuOpen(!isLanguageMenuOpen());
            });
        });

        getLanguageMenuButtons().forEach((button) => {
            button.addEventListener("click", () => {
                const nextLang = button.dataset.lang;

                if (!nextLang || nextLang === state.currentLang || isInteractionLocked()) {
                    setLanguageMenuOpen(false);
                    return;
                }

                setLanguageMenuOpen(false);
                options.onLanguageChange(nextLang, { triggerElement: button });
            });
        });

        if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    setLanguageMenuOpen(false);
                    getLanguageGlobes()[0]?.focus?.();
                }
            });

            document.addEventListener("click", (event) => {
                const target = event.target;
                const clickedPicker = target && typeof target.closest === "function" && target.closest("[data-language-picker]");

                if (!clickedPicker) {
                    setLanguageMenuOpen(false);
                }
            });
        }
    }

    return {
        bind,
        syncUi,
        getGranularityLabels,
        getDirectionLabels,
        getSpeedPreset,
        getTimingConfig,
        getNextLanguageKey
    };
}
