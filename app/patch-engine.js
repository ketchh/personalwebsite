import { escapeHtml, wait } from "./shared.js";

export function createPatchEngine(options) {
    const app = options.app;
    const state = options.state;
    const getLanguageEntry = options.getLanguageEntry;
    const validateLanguageShape = options.validateLanguageShape;
    const validateRenderableTransition = options.validateRenderableTransition;
    const warnMissingPatchElement = options.warnMissingPatchElement;
    const statusChip = options.statusChip;
    const statusRight = options.statusRight;
    const queryPatchElement = typeof options.queryPatchElement === "function"
        ? options.queryPatchElement
        : (key) => {
            if (!app || typeof app.querySelector !== "function") {
                return null;
            }

            return app.querySelector(`[data-patch-key="${key}"]`);
        };
    const getGranularityLabels = options.getGranularityLabels;
    const getDirectionLabels = options.getDirectionLabels;
    const getSpeedPreset = options.getSpeedPreset;
    const getTimingConfig = options.getTimingConfig;
    const buildRenderableFields = typeof options.buildRenderableFields === "function"
        ? options.buildRenderableFields
        : () => [];
    const buildChromeFields = typeof options.buildChromeFields === "function"
        ? options.buildChromeFields
        : () => [];
    const renderApp = options.renderApp;
    const renderContentError = options.renderContentError;
    const applyUiText = options.applyUiText;
    const setGroupPatchState = options.setGroupPatchState;
    const setLanguagePatchState = typeof options.setLanguagePatchState === "function"
        ? options.setLanguagePatchState
        : () => {};
    const getCurrentView = typeof options.getCurrentView === "function"
        ? options.getCurrentView
        : () => "home";
    const syncCurrentSection = typeof options.syncCurrentSection === "function"
        ? options.syncCurrentSection
        : () => {};
    const setRouteTransitionState = typeof options.setRouteTransitionState === "function"
        ? options.setRouteTransitionState
        : () => {};
    const renderHomeEnterFrame = typeof options.renderHomeEnterFrame === "function"
        ? options.renderHomeEnterFrame
        : () => {};
    const renderPageRailFrame = typeof options.renderPageRailFrame === "function"
        ? options.renderPageRailFrame
        : () => {};
    const getHomeEnterTimingConfig = typeof options.getHomeEnterTimingConfig === "function"
        ? options.getHomeEnterTimingConfig
        : () => ({
            studyFrameRevealMs: 500,
            frameRevealMs: 350,
            clearingMs: 90,
            headingGranularity: "char",
            copyGranularity: "word",
            direction: "forward"
        });
    const getPageRailTimingConfig = typeof options.getPageRailTimingConfig === "function"
        ? options.getPageRailTimingConfig
        : () => ({
            exitMs: 120,
            enterMs: 170,
            travelPx: 32
        });
    const getBrowserEntryTimingConfig = typeof options.getBrowserEntryTimingConfig === "function"
        ? options.getBrowserEntryTimingConfig
        : () => ({
            manualReferenceMs: 240,
            entryMs: 120,
            pageGranularity: "word",
            direction: "forward",
            homeCharDelayMs: 12,
            choiceStaggerMs: 18
        });
    const getHomeEnterRevealPayload = typeof options.getHomeEnterRevealPayload === "function"
        ? options.getHomeEnterRevealPayload
        : () => ({ headingText: "", copyText: "" });
    const setRouteHash = typeof options.setRouteHash === "function"
        ? options.setRouteHash
        : () => {};
    const runHomeBrowserEntryPatch = typeof options.runHomeBrowserEntryPatch === "function"
        ? options.runHomeBrowserEntryPatch
        : async () => {};
    const setLanguageEntryState = typeof options.setLanguageEntryState === "function"
        ? options.setLanguageEntryState
        : () => {};
    const isReducedMotion = typeof options.isReducedMotion === "function"
        ? options.isReducedMotion
        : () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function getPatchTokens(text, granularity) {
        if (granularity === "line") {
            return [text];
        }

        if (granularity === "word") {
            return text.match(/\S+\s*|\s+/g) || [text];
        }

        return Array.from(text);
    }

    function buildTokenDiff(before, after, granularity) {
        const beforeTokens = getPatchTokens(before, granularity);
        const afterTokens = getPatchTokens(after, granularity);
        const maxPrefix = Math.min(beforeTokens.length, afterTokens.length);
        let prefixLength = 0;

        while (prefixLength < maxPrefix && beforeTokens[prefixLength] === afterTokens[prefixLength]) {
            prefixLength += 1;
        }

        let beforeSuffixIndex = beforeTokens.length - 1;
        let afterSuffixIndex = afterTokens.length - 1;

        while (
            beforeSuffixIndex >= prefixLength &&
            afterSuffixIndex >= prefixLength &&
            beforeTokens[beforeSuffixIndex] === afterTokens[afterSuffixIndex]
        ) {
            beforeSuffixIndex -= 1;
            afterSuffixIndex -= 1;
        }

        return {
            prefix: beforeTokens.slice(0, prefixLength).join(""),
            removedTokens: beforeTokens.slice(prefixLength, beforeSuffixIndex + 1),
            addedTokens: afterTokens.slice(prefixLength, afterSuffixIndex + 1),
            suffix: beforeTokens.slice(beforeSuffixIndex + 1).join(""),
            changed: before !== after
        };
    }

    function renderPatchState(element, prefix, removedText, addedText, suffix) {
        const parts = [];

        if (prefix) {
            parts.push(`<span class="patch-static">${escapeHtml(prefix)}</span>`);
        }

        if (removedText) {
            parts.push(`<span class="patch-fragment patch-fragment--remove">${escapeHtml(removedText)}</span>`);
        }

        if (addedText) {
            parts.push(`<span class="patch-fragment patch-fragment--add">${escapeHtml(addedText)}</span>`);
        }

        if (suffix) {
            parts.push(`<span class="patch-static">${escapeHtml(suffix)}</span>`);
        }

        element.innerHTML = parts.join("");
    }

    function buildFieldGroups(fromFields, toFields) {
        const groups = [];
        let currentGroup = null;

        for (let index = 0; index < fromFields.length; index += 1) {
            const fromField = fromFields[index];
            const toField = toFields[index];

            if (!currentGroup || currentGroup.name !== fromField.group) {
                currentGroup = {
                    name: fromField.group,
                    pairs: []
                };
                groups.push(currentGroup);
            }

            currentGroup.pairs.push({ fromField, toField });
        }

        return groups;
    }

    function captureInteractionContext(triggerElement) {
        const win = typeof window !== "undefined" ? window : null;
        const doc = typeof document !== "undefined" ? document : null;

        return {
            triggerElement: triggerElement || null,
            activeElement: triggerElement || (doc ? doc.activeElement : null),
            scrollX: win && typeof win.scrollX === "number" ? win.scrollX : 0,
            scrollY: win && typeof win.scrollY === "number" ? win.scrollY : 0
        };
    }

    function buildPatchFields(data) {
        return [
            ...buildChromeFields(data, getCurrentView()),
            ...buildRenderableFields(data)
        ];
    }

    function setHomeEnterSelectionState(targetView, phase, triggerElement) {
        const doc = typeof document !== "undefined" ? document : null;
        const body = doc && doc.body ? doc.body : null;
        const isActive = Boolean(targetView) && phase && phase !== "idle";

        if (body) {
            if (isActive) {
                body.setAttribute("data-home-enter-selected", targetView);
                body.setAttribute("data-home-enter-selection-phase", phase);
            } else {
                body.removeAttribute("data-home-enter-selected");
                body.removeAttribute("data-home-enter-selection-phase");
            }
        }

        if (triggerElement && triggerElement.classList && typeof triggerElement.classList.toggle === "function") {
            triggerElement.classList.toggle("is-home-enter-selected", isActive);

            if (typeof triggerElement.setAttribute === "function") {
                if (isActive) {
                    triggerElement.setAttribute("data-home-enter-selected", targetView);
                    triggerElement.setAttribute("data-home-enter-selection-phase", phase);
                } else {
                    triggerElement.removeAttribute("data-home-enter-selected");
                    triggerElement.removeAttribute("data-home-enter-selection-phase");
                }
            }
        }
    }

    function restoreInteractionContext(context) {
        const win = typeof window !== "undefined" ? window : null;

        if (win && typeof win.scrollTo === "function") {
            win.scrollTo(context.scrollX, context.scrollY);
        }

        const focusTarget = context.triggerElement || context.activeElement;

        if (focusTarget && typeof focusTarget.focus === "function") {
            try {
                focusTarget.focus({ preventScroll: true });
            } catch {
                focusTarget.focus();
            }
        }
    }

    function setLifecycle(phase, details) {
        setLanguagePatchState(phase, details || {});
    }

    function setRouteLifecycle(name, phase, details) {
        setRouteTransitionState(name, phase, details || {});
    }

    function setEntryLifecycle(name, phase, details) {
        setLanguageEntryState(name, phase, details || {});
    }

    async function animateFieldPatch(element, beforeField, afterField, granularity, direction, timingOverride) {
        const beforeText = beforeField.text || "";
        const afterText = afterField.text || "";
        const nextHref = afterField.href || "";

        if (beforeText === afterText) {
            if (element.tagName === "A") {
                if (nextHref) {
                    element.setAttribute("href", nextHref);
                } else {
                    element.removeAttribute("href");
                }
            }
            return;
        }

        const config = typeof timingOverride === "function" ? timingOverride(granularity) : getTimingConfig(granularity);
        const diff = buildTokenDiff(beforeText, afterText, granularity);
        const stepCount = Math.max(diff.removedTokens.length, diff.addedTokens.length, 1);

        renderPatchState(element, diff.prefix, diff.removedTokens.join(""), "", diff.suffix);
        await wait(config.holdDelay);

        for (let step = 1; step <= stepCount; step += 1) {
            const removedText = direction === "reverse"
                ? diff.removedTokens.slice(0, Math.max(diff.removedTokens.length - step, 0)).join("")
                : diff.removedTokens.slice(step).join("");
            const addedText = direction === "reverse"
                ? diff.addedTokens.slice(Math.max(diff.addedTokens.length - step, 0)).join("")
                : diff.addedTokens.slice(0, step).join("");

            renderPatchState(element, diff.prefix, removedText, addedText, diff.suffix);
            await wait(config.stepDelay);
        }

        element.textContent = afterText;

        if (element.tagName === "A") {
            if (nextHref) {
                element.setAttribute("href", nextHref);
            } else {
                element.removeAttribute("href");
            }
        }
    }

    async function animateGroupPatch(group, granularity, direction, timingOverride) {
        const config = typeof timingOverride === "function" ? timingOverride(granularity) : getTimingConfig(granularity);
        const tasks = [];

        setGroupPatchState(group.name, true);

        for (let index = 0; index < group.pairs.length; index += 1) {
            const pair = group.pairs[index];
            const element = queryPatchElement(pair.fromField.key);

            if (!element) {
                warnMissingPatchElement(pair.fromField.key);
                continue;
            }

            const task = wait(index * config.groupStagger).then(() =>
                animateFieldPatch(element, pair.fromField, pair.toField, granularity, direction, timingOverride)
            );

            tasks.push(task);
        }

        await Promise.all(tasks);
        setGroupPatchState(group.name, false);
        await wait(config.groupPause);
    }

    function queryHomeEnterLiveElement(key) {
        if (!app || typeof app.querySelector !== "function") {
            return null;
        }

        return app.querySelector(`[data-home-enter-live-route] [data-patch-key="${String(key).replace(/"/g, "\\\"")}"]`);
    }

    function promoteHomeEnterFrameToContent(targetView) {
        if (!app || typeof app.querySelector !== "function") {
            return;
        }

        const root = app.querySelector(".route-root--home-enter");
        const stack = app.querySelector("[data-home-enter-page-stack]");
        const surface = app.querySelector("[data-home-enter-page-surface]");
        const selection = app.querySelector("[data-home-enter-selection]");
        const frame = app.querySelector("[data-home-enter-frame]");

        [root, stack, surface, selection, frame].forEach((element) => {
            if (element && typeof element.setAttribute === "function") {
                element.setAttribute("data-home-enter-phase", "content");
            }
        });

        if (root && typeof root.setAttribute === "function") {
            root.setAttribute("data-route-phase", "content");
            root.setAttribute("data-current-section", targetView);
        }

        if (surface && typeof surface.setAttribute === "function") {
            surface.setAttribute("data-home-enter-live-route", "");
            surface.setAttribute("data-home-enter-live-view", targetView);
        }
    }

    async function animateHomeEnterRenderableFields(fields, config) {
        const groups = buildFieldGroups(fields, fields.map((field) => ({ ...field })));
        const timing = () => ({
            stepDelay: config.textStepDelayMs || 3,
            holdDelay: config.textHoldDelayMs || 12,
            groupStagger: config.textGroupStaggerMs || 14,
            groupPause: config.textGroupPauseMs || 34
        });

        for (const group of groups) {
            const groupConfig = timing();
            const tasks = [];
            setGroupPatchState(group.name, true);

            for (let index = 0; index < group.pairs.length; index += 1) {
                const pair = group.pairs[index];
                const element = queryHomeEnterLiveElement(pair.toField.key);

                if (!element) {
                    warnMissingPatchElement(pair.toField.key);
                    continue;
                }

                const fromField = { ...pair.toField, text: "" };
                const task = wait(index * groupConfig.groupStagger).then(() =>
                    animateFieldPatch(element, fromField, pair.toField, config.textGranularity || "char", config.direction || "forward", timing)
                );

                tasks.push(task);
            }

            await Promise.all(tasks);
            setGroupPatchState(group.name, false);
            await wait(groupConfig.groupPause);
        }
    }

    function completeLanguage(entry, context, details) {
        state.currentLang = entry.key;
        applyUiText(entry.data);
        setLifecycle("complete", details);
        restoreInteractionContext(context);
    }

    async function runHomeEnterTransition(targetView, transitionOptions = {}) {
        if (state.isPatching || state.isRouteTransitioning) {
            return { started: false, reason: "busy" };
        }

        if (!targetView || targetView === "home" || getCurrentView() !== "home") {
            return { started: false, reason: "not-home" };
        }

        const entry = getLanguageEntry(state.currentLang);

        if (!entry.data) {
            return { started: false, reason: "missing-language" };
        }

        const context = captureInteractionContext(transitionOptions.triggerElement);
        const details = { targetView };

        state.isRouteTransitioning = true;
        setRouteHash(targetView);

        try {
            if (isReducedMotion()) {
                syncCurrentSection(targetView);
                renderApp(entry.data);
                applyUiText(entry.data);
                restoreInteractionContext(context);
                return { started: true, reducedMotion: true };
            }

            const config = getHomeEnterTimingConfig();
            const payload = getHomeEnterRevealPayload(entry.data, targetView);

            setHomeEnterSelectionState(targetView, "clearing", context.triggerElement);
            setRouteLifecycle("home-enter", "clearing", details);
            await wait(config.clearingMs || 0);
            renderHomeEnterFrame(entry.data, targetView, { phase: "frame" });
            applyUiText(entry.data);
            setHomeEnterSelectionState(targetView, "frame", context.triggerElement);
            setRouteLifecycle("home-enter", "frame", details);
            await wait(config.frameRevealMs || 0);
            syncCurrentSection(targetView);
            promoteHomeEnterFrameToContent(targetView);
            applyUiText(entry.data);
            setHomeEnterSelectionState(targetView, "content", context.triggerElement);
            setRouteLifecycle("home-enter", "content", details);
            await wait(config.outlineRevealMs || 260);

            const renderableFields = buildRenderableFields(entry.data);
            if (renderableFields.length) {
                await animateHomeEnterRenderableFields(renderableFields, config);
            } else {
                const headingElement = app.querySelector('[data-home-enter-field="heading"]');
                if (headingElement) {
                    await animateFieldPatch(headingElement, { text: "" }, { text: payload.headingText || "" }, config.headingGranularity || "char", config.direction || "forward");
                }

                const copyElement = app.querySelector('[data-home-enter-field="copy"]');
                if (copyElement && payload.copyText) {
                    await animateFieldPatch(copyElement, { text: "" }, { text: payload.copyText || "" }, config.copyGranularity || "word", config.direction || "forward");
                }
            }

            renderApp(entry.data);
            applyUiText(entry.data);
            restoreInteractionContext(context);
            return { started: true, reducedMotion: false };
        } finally {
            setHomeEnterSelectionState("", "idle", context.triggerElement);
            state.isRouteTransitioning = false;
            setRouteLifecycle("idle", "idle", details);
        }
    }

    async function runDirectEntryTransition(targetView, transitionOptions = {}) {
        if (state.isPatching || state.isRouteTransitioning) {
            return { started: false, reason: "busy" };
        }

        if (!targetView || targetView === "home") {
            return { started: false, reason: "not-section" };
        }

        const entry = getLanguageEntry(state.currentLang);

        if (!entry.data) {
            return { started: false, reason: "missing-language" };
        }

        const context = captureInteractionContext(transitionOptions.triggerElement);
        const details = { targetView };

        state.isRouteTransitioning = true;

        try {
            if (isReducedMotion()) {
                syncCurrentSection(targetView);
                renderApp(entry.data);
                applyUiText(entry.data);
                restoreInteractionContext(context);
                return { started: true, reducedMotion: true };
            }

            const config = getHomeEnterTimingConfig();
            const payload = getHomeEnterRevealPayload(entry.data, targetView);

            syncCurrentSection("home");
            renderHomeEnterFrame(entry.data, targetView, { phase: "frame" });
            applyUiText(entry.data);
            setRouteLifecycle("home-enter", "frame", details);
            await wait(config.frameRevealMs || 0);
            syncCurrentSection(targetView);
            promoteHomeEnterFrameToContent(targetView);
            applyUiText(entry.data);
            setRouteLifecycle("home-enter", "content", details);
            await wait(config.outlineRevealMs || 260);

            const renderableFields = buildRenderableFields(entry.data);
            if (renderableFields.length) {
                await animateHomeEnterRenderableFields(renderableFields, config);
            } else {
                const headingElement = app.querySelector('[data-home-enter-field="heading"]');
                if (headingElement) {
                    await animateFieldPatch(headingElement, { text: "" }, { text: payload.headingText || "" }, config.headingGranularity || "char", config.direction || "forward");
                }

                const copyElement = app.querySelector('[data-home-enter-field="copy"]');
                if (copyElement && payload.copyText) {
                    await animateFieldPatch(copyElement, { text: "" }, { text: payload.copyText || "" }, config.copyGranularity || "word", config.direction || "forward");
                }
            }

            renderApp(entry.data);
            applyUiText(entry.data);
            restoreInteractionContext(context);
            return { started: true, reducedMotion: false };
        } finally {
            state.isRouteTransitioning = false;
            setRouteLifecycle("idle", "idle", details);
        }
    }

    async function runPageRailTransition(targetView, transitionOptions = {}) {
        if (state.isPatching || state.isRouteTransitioning) {
            return { started: false, reason: "busy" };
        }

        const fromView = getCurrentView();

        if (!targetView || targetView === "home" || fromView === "home" || fromView === targetView) {
            return { started: false, reason: "not-section" };
        }

        const entry = getLanguageEntry(state.currentLang);

        if (!entry.data) {
            return { started: false, reason: "missing-language" };
        }

        const config = getPageRailTimingConfig();
        const context = captureInteractionContext(transitionOptions.triggerElement);
        const details = { fromView, targetView };

        state.isRouteTransitioning = true;
        setRouteHash(targetView);
        syncCurrentSection(targetView);
        setRouteLifecycle("page-rail", "exiting", details);

        try {
            if (isReducedMotion()) {
                renderApp(entry.data);
                applyUiText(entry.data);
                restoreInteractionContext(context);
                return { started: true, reducedMotion: true };
            }

            renderPageRailFrame(entry.data, fromView, targetView, { phase: "exiting", timing: config });
            await wait(config.exitMs || 0);
            renderPageRailFrame(entry.data, fromView, targetView, { phase: "entering", timing: config });
            setRouteLifecycle("page-rail", "entering", details);
            await wait(config.enterMs || 0);
            renderApp(entry.data);
            applyUiText(entry.data);
            restoreInteractionContext(context);
            return { started: true, reducedMotion: false };
        } finally {
            state.isRouteTransitioning = false;
            setRouteLifecycle("idle", "idle", details);
        }
    }

    async function runBrowserEntryTransition(targetLang, transitionOptions = {}) {
        if (state.isPatching || state.isRouteTransitioning || state.browserEntryCompleted) {
            return { started: false, reason: state.browserEntryCompleted ? "complete" : "busy" };
        }

        let fromEntry = getLanguageEntry(state.currentLang);
        const toEntry = getLanguageEntry(targetLang, state.currentLang);

        if (!fromEntry.data || !toEntry.data) {
            return { started: false, reason: "missing-language" };
        }

        let stagesFromOppositeLanguage = false;

        if (fromEntry.key === toEntry.key) {
            const oppositeRequestedKey = toEntry.key === "it" ? "en" : "it";
            const oppositeEntry = getLanguageEntry(oppositeRequestedKey, toEntry.key);

            if (oppositeEntry.data && oppositeEntry.key !== toEntry.key) {
                fromEntry = oppositeEntry;
                stagesFromOppositeLanguage = true;
            } else {
                state.browserEntryCompleted = true;
                setEntryLifecycle("idle", "idle", {
                    fromLang: fromEntry.key,
                    toLang: toEntry.key,
                    currentView: getCurrentView()
                });
                return { started: false, reason: "already-target" };
            }
        }

        const details = {
            fromLang: fromEntry.key,
            toLang: toEntry.key,
            currentView: getCurrentView()
        };
        const context = captureInteractionContext(transitionOptions.triggerElement);
        const config = getBrowserEntryTimingConfig();
        const timingScale = config.manualReferenceMs > 0 ? config.entryMs / config.manualReferenceMs : 0.5;
        const timingOverride = (granularity) => {
            const base = getTimingConfig(granularity);
            return {
                stepDelay: Math.max(1, Math.round(base.stepDelay * timingScale)),
                holdDelay: Math.max(1, Math.round(base.holdDelay * timingScale)),
                groupStagger: Math.max(1, Math.round(base.groupStagger * timingScale)),
                groupPause: Math.max(1, Math.round(base.groupPause * timingScale))
            };
        };

        state.isPatching = true;
        setEntryLifecycle("browser-entry", "staging", details);

        try {
            if (isReducedMotion()) {
                state.currentLang = toEntry.key;
                renderApp(toEntry.data);
                applyUiText(toEntry.data);
                setLifecycle("complete", details);
                restoreInteractionContext(context);
                return { started: true, reducedMotion: true };
            }

            if (stagesFromOppositeLanguage) {
                state.currentLang = fromEntry.key;
                renderApp(fromEntry.data);
                applyUiText(fromEntry.data);
            }

            setLifecycle("patching", details);

            if (getCurrentView() === "home") {
                setEntryLifecycle("browser-entry", "patching", details);
                await runHomeBrowserEntryPatch({
                    fromUi: {
                        introHint: fromEntry.data.ui && fromEntry.data.ui.introHint,
                        sectionChoices: fromEntry.data.sectionChooser && fromEntry.data.sectionChooser.choices
                    },
                    toUi: {
                        introHint: toEntry.data.ui && toEntry.data.ui.introHint,
                        sectionChoices: toEntry.data.sectionChooser && toEntry.data.sectionChooser.choices
                    },
                    timing: config,
                    details
                });
                state.currentLang = toEntry.key;
                renderApp(toEntry.data);
                applyUiText(toEntry.data);
                setLifecycle("complete", details);
                restoreInteractionContext(context);
                return { started: true, reducedMotion: false };
            }

            validateLanguageShape(fromEntry.key, fromEntry.data);
            validateLanguageShape(toEntry.key, toEntry.data);

            const fromFields = buildPatchFields(fromEntry.data);
            const toFields = buildPatchFields(toEntry.data);
            const isValidTransition = validateRenderableTransition(fromFields, toFields, fromEntry.key, toEntry.key);

            if (!isValidTransition) {
                const error = new Error(`Published content browser-entry mismatch: ${fromEntry.key} -> ${toEntry.key}.`);
                setLifecycle("error", details);
                if (typeof renderContentError === "function") {
                    renderContentError(error);
                }
                restoreInteractionContext(context);
                return { started: false, reason: "field-mismatch", error };
            }

            const granularity = config.pageGranularity || "word";
            const direction = config.direction || "forward";
            const groups = buildFieldGroups(fromFields, toFields);

            setEntryLifecycle("browser-entry", "patching", details);

            for (const group of groups) {
                await animateGroupPatch(group, granularity, direction, timingOverride);
            }

            completeLanguage(toEntry, context, details);
            return { started: true, reducedMotion: false };
        } finally {
            state.isPatching = false;
            state.browserEntryCompleted = true;
            setEntryLifecycle("idle", "idle", { ...details, completed: state.currentLang === toEntry.key });
            setLifecycle("idle", { ...details, completed: state.currentLang === toEntry.key });
        }
    }

    async function runPatch(nextLang, patchOptions = {}) {
        if (state.isPatching) {
            return { started: false, reason: "busy" };
        }

        const fromEntry = getLanguageEntry(state.currentLang);
        const toEntry = getLanguageEntry(nextLang, state.currentLang);

        if (!fromEntry.data || !toEntry.data || fromEntry.key === toEntry.key) {
            return { started: false, reason: "noop" };
        }

        const fromData = fromEntry.data;
        const toData = toEntry.data;
        const currentGranularity = state.patchGranularity;
        const currentDirection = state.patchDirection;
        const context = captureInteractionContext(patchOptions.triggerElement);
        const details = {
            fromLang: fromEntry.key,
            toLang: toEntry.key,
            granularity: currentGranularity,
            direction: currentDirection
        };

        validateLanguageShape(fromEntry.key, fromData);
        validateLanguageShape(toEntry.key, toData);

        const granularityLabels = getGranularityLabels(fromData, currentGranularity);
        const directionLabels = getDirectionLabels(fromData, currentDirection);
        const speedPreset = getSpeedPreset(fromData, state.patchSpeedPreset);
        const fromFields = buildPatchFields(fromData);
        const toFields = buildPatchFields(toData);
        const isValidTransition = validateRenderableTransition(fromFields, toFields, fromEntry.key, toEntry.key);

        if (!isValidTransition) {
            const error = new Error(`Published content language patch mismatch: ${fromEntry.key} -> ${toEntry.key}.`);
            setLifecycle("error", details);
            if (typeof renderContentError === "function") {
                renderContentError(error);
            }
            restoreInteractionContext(context);
            return { started: false, reason: "field-mismatch", error };
        }

        state.isPatching = true;
        setLifecycle("patching", details);

        if (statusChip) {
            statusChip.textContent = `git apply resume.${fromEntry.key}->${toEntry.key}.patch --${currentGranularity} --${currentDirection} --speed=${state.patchSpeedPreset}`;
        }

        if (statusRight) {
            statusRight.textContent = `${fromData.ui.statusRight} / ${fromEntry.key}->${toEntry.key} / ${directionLabels.short} / ${granularityLabels.short} / ${speedPreset.short}`;
        }

        try {
            if (isReducedMotion()) {
                state.currentLang = toEntry.key;
                renderApp(toData);
                applyUiText(toData);
                setLifecycle("complete", details);
                restoreInteractionContext(context);
                return { started: true, reducedMotion: true };
            }

            const groups = buildFieldGroups(fromFields, toFields);

            for (const group of groups) {
                await animateGroupPatch(group, currentGranularity, currentDirection);
            }

            completeLanguage(toEntry, context, details);
            return { started: true, reducedMotion: false };
        } finally {
            state.isPatching = false;
            setLifecycle("idle", { ...details, completed: state.currentLang === toEntry.key });
        }
    }

    return {
        runHomeEnterTransition,
        runDirectEntryTransition,
        runPageRailTransition,
        runBrowserEntryTransition,
        runPatch,
        buildTokenDiff
    };
}
