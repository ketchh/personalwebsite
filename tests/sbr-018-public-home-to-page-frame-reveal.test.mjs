import assert from "node:assert/strict";
import fs from "node:fs";
import { createPatchEngine } from "../app/patch-engine.js";
import { createPublishedSource } from "../app/content-loader.js";

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
        }
    };

    Object.entries(options.attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));

    return element;
}

function installBrowserGlobals({ reducedMotion = false, hash = "#/", scrollY = 0, activeElement = null } = {}) {
    const scrollCalls = [];

    globalThis.window = {
        location: { hash },
        scrollX: 0,
        scrollY,
        setTimeout,
        clearTimeout,
        matchMedia: () => ({ matches: reducedMotion }),
        scrollTo(x, y) {
            scrollCalls.push({ x, y });
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

    return { scrollCalls };
}

function createHomeEnterApp() {
    const elements = new Map();
    const app = {
        innerHTML: "",
        querySelector(selector) {
            return elements.get(selector) || null;
        },
        setAttribute() {}
    };

    return {
        app,
        setFrameElements(view) {
            const frame = createElement({ dataset: { homeEnterFrame: "true", homeEnterView: view, frameOrigin: "center" } });
            const heading = createElement({ tagName: "H1", attributes: { "data-route-heading": "", "data-home-enter-field": "heading" } });
            const copy = createElement({ tagName: "P", attributes: { "data-home-enter-field": "copy" } });
            elements.set("[data-home-enter-frame]", frame);
            elements.set("[data-home-enter-field=\"heading\"]", heading);
            elements.set("[data-home-enter-field=\"copy\"]", copy);
            return { frame, heading, copy };
        }
    };
}

const source = readSource();
const configSource = fs.readFileSync("config.js", "utf8");
const patchEngineSource = fs.readFileSync("app/patch-engine.js", "utf8");
const renderSource = fs.readFileSync("app/render.js", "utf8");
const introCss = fs.readFileSync("styles/intro.css", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const patchCss = fs.readFileSync("styles/patch.css", "utf8");

{
    assert.match(configSource, /homeEnterTransition\s*:/, "config.js exposes Home→page transition config");
    const studyMatch = configSource.match(/studyFrameRevealMs\s*:\s*(\d+)/);
    const frameMatch = configSource.match(/frameRevealMs\s*:\s*(\d+)/);
    assert.ok(studyMatch && frameMatch, "frame study and production timing values are defined");
    assert.equal(Number(frameMatch[1]), Math.round(Number(studyMatch[1]) * 0.7), "production frame reveal is exactly 70% of the study baseline");
}

{
    assert.match(patchEngineSource, /runHomeEnterTransition\s*\(/, "patch engine exposes a dedicated Home→page transition runner");
    assert.match(patchEngineSource, /animateFieldPatch\([^\n]*heading/i, "Home→page content reveal uses existing patch-field animation for the heading");
    assert.match(renderSource, /data-home-enter-page-surface/, "renderer exposes a deterministic destination-page ingress surface during Home→page transition");
    assert.match(renderSource, /data-home-enter-live-route/, "renderer also exposes a deterministic live-route continuity surface for the final handoff into the real page");
    assert.match(shellCss + patchCss, /\[data-route-transition="home-enter"\][\s\S]*\[data-home-enter-frame\]/, "CSS styles the Home→page transition shell and frame markers");
    assert.match(shellCss + patchCss, /home-enter-page-surface|data-home-enter-page-surface/, "CSS styles the destination-page ingress surface instead of deferring it to a later pop-in render");
    assert.match(shellCss + patchCss, /home-enter-live-route|data-home-enter-live-route/, "CSS also styles the live-route continuity surface so the final route no longer snaps in abruptly");
    assert.match(shellCss + patchCss, /data-frame-origin|transform-origin:\s*center/i, "frame reveal is structurally centered in CSS/DOM markers");
    assert.match(introCss, /site-intro-title[\s\S]*opacity:\s*0/s, "intro CSS withdraws the lingering Home greeting so the page build becomes the primary visible feedback surface");
    assert.match(introCss, /intro-cursor[\s\S]*opacity:\s*0/s, "intro CSS also withdraws the blinking Home cursor during the active page build");
}

{
    const currentViewRef = { value: "home" };
    const state = {
        currentLang: "it",
        isPatching: false,
        isRouteTransitioning: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3"
    };
    const shell = createElement();
    const languageGlobe = createElement({ tagName: "BUTTON" });
    const { app, setFrameElements } = createHomeEnterApp();
    const phases = [];
    const frameCalls = [];
    let renderCount = 0;

    installBrowserGlobals({ reducedMotion: false, hash: "#/", scrollY: 240, activeElement: languageGlobe });

    const patchEngine = createPatchEngine({
        app,
        state,
        getCurrentView: () => currentViewRef.value,
        getLanguageEntry: () => ({ key: state.currentLang, data: source.languages[state.currentLang] }),
        validateLanguageShape: () => true,
        validateRenderableTransition: () => true,
        warnMissingPatchElement: () => {},
        statusRight: createElement(),
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "reverse", long: "from end to start" }),
        getSpeedPreset: () => ({ short: "slow", long: "slower", multiplier: 1 }),
        getTimingConfig: () => ({ stepDelay: 1, holdDelay: 1, groupStagger: 1, groupPause: 1 }),
        getHomeEnterTimingConfig: () => ({ studyFrameRevealMs: 100, frameRevealMs: 70, clearingMs: 1 }),
        getHomeEnterRevealPayload: (data, view) => ({
            headingText: view === "resume" ? data.hero.name : data.sectionChooser.choices.find((choice) => choice.key === view).label,
            copyText: view === "resume" ? data.hero.summary : data.sectionChooser.choices.find((choice) => choice.key === view).copy
        }),
        buildRenderableFields: () => [],
        renderHomeEnterFrame: (_data, view, details) => {
            frameCalls.push({ view, phase: details.phase });
            setFrameElements(view);
        },
        renderApp: () => {
            renderCount += 1;
        },
        renderContentError: () => {},
        applyUiText: (data) => {
            document.documentElement.lang = data.htmlLang;
        },
        setGroupPatchState: () => {},
        syncCurrentSection: (view) => {
            currentViewRef.value = view;
        },
        setRouteTransitionState: (name, phase) => {
            shell.setAttribute("data-route-transition", name || "idle");
            shell.setAttribute("data-route-phase", phase || "idle");
            languageGlobe.setAttribute("aria-disabled", String(Boolean(state.isPatching || state.isRouteTransitioning)));
            phases.push({ name, phase, globeDisabled: languageGlobe.getAttribute("aria-disabled") });
        },
        isReducedMotion: () => false
    });

    const result = await patchEngine.runHomeEnterTransition("resume", { triggerElement: languageGlobe });

    assert.equal(result.started, true, "Home→page transition starts from Home");
    assert.deepEqual(phases.map((entry) => entry.phase), ["clearing", "frame", "content", "idle"], "Home→page transition runs through clearing → frame → content → idle");
    assert.ok(phases.slice(0, 3).every((entry) => entry.globeDisabled === "true"), "language globe stays disabled during active Home→page phases");
    assert.equal(phases.at(-1).globeDisabled, "false", "language globe unlocks once the transition is idle again");
    assert.deepEqual(frameCalls, [
        { view: "resume", phase: "frame" }
    ], "frame render runs once, then promotes the staged outline surface for content without restarting motion");
    assert.equal(currentViewRef.value, "resume", "target route becomes current by the end of the Home→page transition");
    assert.equal(renderCount, 1, "final target route render runs once after the staged reveal");
    assert.equal(window.scrollY, 240, "Home→page transition restores scroll context");
    assert.equal(languageGlobe.focused, true, "focus returns to the initiating control after Home→page transition");
}

{
    const currentViewRef = { value: "resume" };
    const state = {
        currentLang: "it",
        isPatching: false,
        isRouteTransitioning: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3"
    };

    installBrowserGlobals({ reducedMotion: false, hash: "#/resume" });

    const patchEngine = createPatchEngine({
        app: { querySelector: () => null },
        state,
        getCurrentView: () => currentViewRef.value,
        getLanguageEntry: () => ({ key: state.currentLang, data: source.languages[state.currentLang] }),
        validateLanguageShape: () => true,
        validateRenderableTransition: () => true,
        warnMissingPatchElement: () => {},
        statusRight: createElement(),
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "reverse", long: "from end to start" }),
        getSpeedPreset: () => ({ short: "slow", long: "slower", multiplier: 1 }),
        getTimingConfig: () => ({ stepDelay: 1, holdDelay: 1, groupStagger: 1, groupPause: 1 }),
        getHomeEnterTimingConfig: () => ({ studyFrameRevealMs: 100, frameRevealMs: 70, clearingMs: 1 }),
        getHomeEnterRevealPayload: () => ({ headingText: "Resume", copyText: "Copy" }),
        buildRenderableFields: () => [],
        renderHomeEnterFrame: () => {},
        renderApp: () => {},
        renderContentError: () => {},
        applyUiText: () => {},
        setGroupPatchState: () => {},
        syncCurrentSection: (view) => {
            currentViewRef.value = view;
        },
        setRouteTransitionState: () => {},
        isReducedMotion: () => false
    });

    const result = await patchEngine.runHomeEnterTransition("blog", { triggerElement: createElement({ tagName: "BUTTON" }) });
    assert.equal(result.started, false, "direct non-Home views do not replay the Home-only transition");
}

{
    const currentViewRef = { value: "home" };
    const state = {
        currentLang: "it",
        isPatching: false,
        isRouteTransitioning: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3"
    };
    let frameRenderCount = 0;
    let renderCount = 0;
    const phases = [];

    installBrowserGlobals({ reducedMotion: true, hash: "#/" });

    const patchEngine = createPatchEngine({
        app: { querySelector: () => null },
        state,
        getCurrentView: () => currentViewRef.value,
        getLanguageEntry: () => ({ key: state.currentLang, data: source.languages[state.currentLang] }),
        validateLanguageShape: () => true,
        validateRenderableTransition: () => true,
        warnMissingPatchElement: () => {},
        statusRight: createElement(),
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "reverse", long: "from end to start" }),
        getSpeedPreset: () => ({ short: "slow", long: "slower", multiplier: 1 }),
        getTimingConfig: () => {
            throw new Error("reduced-motion Home→page transition should not request patch timing");
        },
        getHomeEnterTimingConfig: () => ({ studyFrameRevealMs: 100, frameRevealMs: 70, clearingMs: 1 }),
        getHomeEnterRevealPayload: () => ({ headingText: "Blog", copyText: "Copy" }),
        buildRenderableFields: () => [],
        renderHomeEnterFrame: () => {
            frameRenderCount += 1;
        },
        renderApp: () => {
            renderCount += 1;
        },
        renderContentError: () => {},
        applyUiText: () => {},
        setGroupPatchState: () => {},
        syncCurrentSection: (view) => {
            currentViewRef.value = view;
        },
        setRouteTransitionState: (name, phase) => {
            phases.push({ name, phase });
        },
        isReducedMotion: () => true
    });

    const result = await patchEngine.runHomeEnterTransition("blog", { triggerElement: createElement({ tagName: "BUTTON" }) });
    assert.equal(result.started, true, "reduced-motion Home→page transition still starts");
    assert.equal(result.reducedMotion, true, "reduced-motion path reports direct render");
    assert.equal(frameRenderCount, 0, "reduced-motion path skips the staged frame render");
    assert.equal(renderCount, 1, "reduced-motion path lands directly on the target render");
    assert.ok(phases.every((entry) => entry.name === "idle" || entry.phase === "idle"), "reduced-motion path bypasses the staged Home→page lifecycle");
}

console.log("SBR-018 public Home-to-page frame reveal assertions passed");
