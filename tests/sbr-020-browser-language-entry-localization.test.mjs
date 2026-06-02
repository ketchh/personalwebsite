import assert from "node:assert/strict";
import fs from "node:fs";
import { buildShellNavigationFields } from "../app/controls.js";
import { createPatchEngine } from "../app/patch-engine.js";
import { createPublishedSource } from "../app/content-loader.js";
import { createIntroController } from "../app/intro.js";
import { createRenderer } from "../app/render.js";

function readSource() {
    return createPublishedSource(JSON.parse(fs.readFileSync("data/published.json", "utf8")));
}

function createClassList(initial = []) {
    const classes = new Set(initial);

    return {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        toggle: (name, force) => {
            const shouldAdd = typeof force === "boolean" ? force : !classes.has(name);
            if (shouldAdd) {
                classes.add(name);
            } else {
                classes.delete(name);
            }
            return shouldAdd;
        },
        contains: (name) => classes.has(name),
        toString: () => [...classes].join(" ")
    };
}

function createElement(options = {}) {
    const attributes = new Map();
    const element = {
        tagName: options.tagName || "DIV",
        dataset: { ...(options.dataset || {}) },
        classList: createClassList(options.classNames || []),
        textContent: options.textContent || "",
        innerHTML: options.innerHTML || "",
        hidden: Boolean(options.hidden),
        focused: false,
        setAttribute(name, value) {
            attributes.set(name, String(value));
            if (name === "hidden") {
                element.hidden = true;
            }
            if (name.startsWith("data-")) {
                const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                element.dataset[key] = String(value);
            }
        },
        getAttribute(name) {
            return attributes.has(name) ? attributes.get(name) : null;
        },
        removeAttribute(name) {
            attributes.delete(name);
            if (name === "hidden") {
                element.hidden = false;
            }
        },
        focus() {
            element.focused = true;
            if (globalThis.document) {
                globalThis.document.activeElement = element;
            }
        },
        querySelector() {
            return null;
        }
    };

    Object.entries(options.attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));

    return element;
}

function createIntroChoiceLink(sectionChoice, label) {
    const labelElement = createElement({ textContent: label });

    return {
        dataset: { sectionChoice },
        querySelector(selector) {
            return selector === "strong" ? labelElement : null;
        },
        labelElement
    };
}

function installBrowserGlobals({ reducedMotion = false, hash = "#/resume", scrollY = 0, activeElement = null } = {}) {
    globalThis.window = {
        location: { hash },
        scrollX: 0,
        scrollY,
        setTimeout,
        clearTimeout,
        matchMedia: () => ({ matches: reducedMotion }),
        scrollTo(x, y) {
            window.scrollX = x;
            window.scrollY = y;
        }
    };

    globalThis.document = {
        documentElement: {
            lang: "it",
            setAttribute(name, value) {
                this[name] = String(value);
            }
        },
        activeElement,
        contains: () => true
    };
}

const source = readSource();
const configSource = fs.readFileSync("config.js", "utf8");
const scriptSource = fs.readFileSync("script.js", "utf8");
const patchEngineSource = fs.readFileSync("app/patch-engine.js", "utf8");
const introSource = fs.readFileSync("app/intro.js", "utf8");

{
    assert.match(configSource, /browserEntryTransition\s*:/, "config.js exposes a dedicated browser-entry transition config");
    const manualMatch = configSource.match(/manualReferenceMs\s*:\s*(\d+)/);
    const entryMatch = configSource.match(/entryMs\s*:\s*(\d+)/);
    assert.ok(manualMatch && entryMatch, "browser-entry config includes manual-reference and entry timing values");
    assert.equal(Number(entryMatch[1]), Math.round(Number(manualMatch[1]) * 0.5), "browser-entry timing is exactly 50% of the manual reference timing");
    assert.match(patchEngineSource, /runBrowserEntryTransition\s*\(/, "patch engine exposes a browser-entry transition runner");
    assert.match(scriptSource, /data-language-entry/, "script drives deterministic browser-entry lifecycle markers on the shell");
    assert.match(scriptSource, /navigator\.languages|navigator\.language/, "script resolves the target language from browser locale signals");
    assert.match(introSource, /runBrowserEntryPatch\s*\(/, "intro controller exposes a dedicated Home browser-entry patch runner");
}

{
    installBrowserGlobals({ reducedMotion: false, hash: "#/" });

    const hint = createElement({ textContent: source.languages.it.ui.introHint });
    const introChoices = [
        createIntroChoiceLink("resume", source.languages.it.sectionChooser.choices[0].label),
        createIntroChoiceLink("blog", source.languages.it.sectionChooser.choices[1].label),
        createIntroChoiceLink("resources", source.languages.it.sectionChooser.choices[2].label)
    ];
    const choices = {
        classList: createClassList(),
        querySelectorAll(selector) {
            return selector === "[data-section-choice]" ? introChoices : [];
        }
    };
    const intro = createIntroController({
        refs: {
            prefix: null,
            typingArea: null,
            hint,
            choices
        },
        introConfig: {
            greeting: "hello",
            wordsList: [" world"],
            initialDelay: 0,
            typingSpeed: 1,
            deletingSpeed: 1,
            pauseTime: 1,
            restartDelay: 1,
            arrowRevealDelay: 1,
            hintRevealDelay: 1,
            choicesRevealDelay: 1
        }
    });

    await intro.runBrowserEntryPatch({
        fromUi: {
            introHint: source.languages.it.ui.introHint,
            sectionChoices: source.languages.it.sectionChooser.choices
        },
        toUi: {
            introHint: source.languages.en.ui.introHint,
            sectionChoices: source.languages.en.sectionChooser.choices
        },
        timing: {
            homeCharDelayMs: 1,
            choiceStaggerMs: 1
        }
    });

    assert.equal(hint.textContent, source.languages.en.ui.introHint, "Home browser-entry patch finishes with the target-language question copy");
    assert.deepEqual(
        introChoices.map((choice) => choice.labelElement.textContent),
        source.languages.en.sectionChooser.choices.map((choice) => choice.label),
        "Home browser-entry patch finishes with the target-language section labels"
    );
    assert.equal(choices.classList.contains("is-visible"), true, "Home browser-entry patch reveals the intro choices while animating them");
}

{
    installBrowserGlobals({ reducedMotion: false, hash: "#/resume", scrollY: 220, activeElement: createElement({ tagName: "BUTTON" }) });

    const currentViewRef = { value: "resume" };
    const state = {
        currentLang: "it",
        isPatching: false,
        isRouteTransitioning: false,
        browserEntryCompleted: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3",
        languagePatchState: "idle"
    };
    const patchTargets = new Map([
        ['[data-patch-key="shell-nav-resume-label"]', createElement({ tagName: "A", textContent: source.languages.it.sectionChooser.choices[0].label, attributes: { href: "#/resume" } })],
        ['[data-patch-key="hero-summary"]', createElement({ textContent: source.languages.it.hero.summary })]
    ]);
    const app = {
        querySelector(selector) {
            return patchTargets.get(selector) || null;
        },
        setAttribute() {}
    };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => currentViewRef.value
    });
    const entryPhases = [];
    const patchPhases = [];
    const languageGlobe = createElement({ tagName: "BUTTON" });
    let renderCount = 0;
    let introPatchCount = 0;

    const patchEngine = createPatchEngine({
        app,
        state,
        getCurrentView: () => currentViewRef.value,
        getLanguageEntry: (requestedKey, fallbackKey) => {
            const key = requestedKey || fallbackKey || state.currentLang;
            return { key, data: source.languages[key] };
        },
        validateLanguageShape: () => true,
        validateRenderableTransition: () => true,
        warnMissingPatchElement: () => {},
        statusRight: createElement(),
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "reverse", long: "from end to start" }),
        getSpeedPreset: () => ({ short: "slow", long: "slower", multiplier: 1 }),
        getTimingConfig: () => ({ stepDelay: 2, holdDelay: 2, groupStagger: 1, groupPause: 1 }),
        getBrowserEntryTimingConfig: () => ({ manualReferenceMs: 100, entryMs: 50, pageGranularity: "word", direction: "forward", homeCharDelayMs: 1, choiceStaggerMs: 1 }),
        buildRenderableFields: renderer.buildRenderableFields,
        buildChromeFields: buildShellNavigationFields,
        queryPatchElement: (key) => patchTargets.get(`[data-patch-key="${key}"]`) || null,
        renderApp: () => {
            renderCount += 1;
        },
        renderContentError: () => {},
        applyUiText: (data) => {
            document.documentElement.lang = data.htmlLang;
        },
        setGroupPatchState: () => {},
        syncCurrentSection: () => {},
        setRouteTransitionState: () => {},
        setLanguageEntryState: (name, phase) => {
            entryPhases.push({ name, phase });
        },
        setLanguagePatchState: (phase) => {
            languageGlobe.setAttribute("aria-disabled", String(phase === "patching"));
            patchPhases.push({ phase, globeDisabled: languageGlobe.getAttribute("aria-disabled") });
        },
        runHomeBrowserEntryPatch: async () => {
            introPatchCount += 1;
        },
        isReducedMotion: () => false
    });

    const result = await patchEngine.runBrowserEntryTransition("en");

    assert.equal(result.started, true, "browser-entry patch starts when the detected target differs from the boot language");
    assert.deepEqual(entryPhases.map((entry) => `${entry.name}:${entry.phase}`), ["browser-entry:staging", "browser-entry:patching", "idle:idle"], "browser-entry lifecycle runs through staging → patching → idle");
    assert.deepEqual(patchPhases.map((entry) => entry.phase), ["patching", "complete", "idle"], "browser-entry patch reuses the language patch lifecycle states");
    assert.ok(patchPhases.slice(0, 1).every((entry) => entry.globeDisabled === "true"), "language control stays disabled while browser-entry patching is active");
    assert.equal(patchPhases.at(-1).globeDisabled, "false", "language control unlocks when browser-entry patching returns idle");
    assert.equal(state.currentLang, "en", "browser-entry patch finishes in the detected target language");
    assert.equal(document.documentElement.lang, "en", "browser-entry patch updates document language to the detected target");
    assert.equal(patchTargets.get('[data-patch-key="shell-nav-resume-label"]').textContent, source.languages.en.sectionChooser.choices[0].label, "visible section label patches into the target language");
    assert.equal(patchTargets.get('[data-patch-key="hero-summary"]').textContent, source.languages.en.hero.summary, "visible route copy patches into the target language");
    assert.equal(renderCount, 0, "non-Home browser-entry patch reuses the existing rendered surface instead of doing a fallback full rerender");
    assert.equal(introPatchCount, 0, "non-Home browser-entry path does not invoke the Home-only intro patch runner");
}

{
    installBrowserGlobals({ reducedMotion: false, hash: "#/" });

    const state = {
        currentLang: "it",
        isPatching: false,
        isRouteTransitioning: false,
        browserEntryCompleted: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3"
    };
    const entryPhases = [];
    const patchPhases = [];
    let renderCount = 0;
    let introPatchCount = 0;

    const patchEngine = createPatchEngine({
        app: { querySelector: () => null },
        state,
        getCurrentView: () => "home",
        getLanguageEntry: (requestedKey, fallbackKey) => {
            const key = requestedKey || fallbackKey || state.currentLang;
            return { key, data: source.languages[key] };
        },
        validateLanguageShape: () => true,
        validateRenderableTransition: () => true,
        warnMissingPatchElement: () => {},
        statusRight: createElement(),
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "reverse", long: "from end to start" }),
        getSpeedPreset: () => ({ short: "slow", long: "slower", multiplier: 1 }),
        getTimingConfig: () => ({ stepDelay: 1, holdDelay: 1, groupStagger: 1, groupPause: 1 }),
        getBrowserEntryTimingConfig: () => ({ manualReferenceMs: 100, entryMs: 50, pageGranularity: "word", direction: "forward", homeCharDelayMs: 1, choiceStaggerMs: 1 }),
        buildRenderableFields: () => [],
        renderApp: () => {
            renderCount += 1;
        },
        renderContentError: () => {},
        applyUiText: () => {},
        setGroupPatchState: () => {},
        syncCurrentSection: () => {},
        setRouteTransitionState: () => {},
        setLanguageEntryState: (name, phase) => {
            entryPhases.push({ name, phase });
        },
        setLanguagePatchState: (phase) => {
            patchPhases.push(phase);
        },
        runHomeBrowserEntryPatch: async () => {
            introPatchCount += 1;
        }
    });

    const result = await patchEngine.runBrowserEntryTransition("it");
    assert.equal(result.started, true, "matching-target browser-language boots still run the one-time browser-entry lifecycle instead of exiting as a no-op");
    assert.deepEqual(entryPhases.map((entry) => `${entry.name}:${entry.phase}`), ["browser-entry:staging", "browser-entry:patching", "idle:idle"], "matching-target browser-language boots still expose the browser-entry lifecycle markers");
    assert.deepEqual(patchPhases, ["patching", "complete", "idle"], "matching-target browser-language boots still drive the language patch lifecycle");
    assert.equal(introPatchCount, 1, "Home matching-target browser-language boots still run the Home-only intro entry variant");
    assert.ok(renderCount >= 1, "matching-target browser-language boots still settle through the target render after the opposite-language staging step");
}

{
    installBrowserGlobals({ reducedMotion: true, hash: "#/blog" });

    const currentViewRef = { value: "blog" };
    const state = {
        currentLang: "it",
        isPatching: false,
        isRouteTransitioning: false,
        browserEntryCompleted: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3"
    };
    let renderCount = 0;
    let introPatchCount = 0;

    const patchEngine = createPatchEngine({
        app: { querySelector: () => null },
        state,
        getCurrentView: () => currentViewRef.value,
        getLanguageEntry: (requestedKey, fallbackKey) => {
            const key = requestedKey || fallbackKey || state.currentLang;
            return { key, data: source.languages[key] };
        },
        validateLanguageShape: () => true,
        validateRenderableTransition: () => true,
        warnMissingPatchElement: () => {},
        statusRight: createElement(),
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "reverse", long: "from end to start" }),
        getSpeedPreset: () => ({ short: "slow", long: "slower", multiplier: 1 }),
        getTimingConfig: () => {
            throw new Error("reduced-motion browser-entry patch should not request patch timing");
        },
        getBrowserEntryTimingConfig: () => ({ manualReferenceMs: 100, entryMs: 50, pageGranularity: "word", direction: "forward" }),
        buildRenderableFields: () => [],
        renderApp: () => {
            renderCount += 1;
        },
        renderContentError: () => {},
        applyUiText: () => {},
        setGroupPatchState: () => {},
        syncCurrentSection: () => {},
        setRouteTransitionState: () => {},
        setLanguageEntryState: () => {},
        setLanguagePatchState: () => {},
        runHomeBrowserEntryPatch: async () => {
            introPatchCount += 1;
        },
        isReducedMotion: () => true
    });

    const result = await patchEngine.runBrowserEntryTransition("en");
    assert.equal(result.started, true, "reduced-motion browser-entry still starts when the target differs from the boot language");
    assert.equal(result.reducedMotion, true, "reduced-motion browser-entry reports direct landing");
    assert.equal(renderCount, 1, "reduced-motion browser-entry lands directly on the target render");
    assert.equal(introPatchCount, 0, "reduced-motion browser-entry skips the Home-only intro patch runner on non-Home routes");
}

console.log("SBR-020 browser-language entry localization assertions passed");
