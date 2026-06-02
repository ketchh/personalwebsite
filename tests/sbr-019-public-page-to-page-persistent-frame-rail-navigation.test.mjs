import assert from "node:assert/strict";
import fs from "node:fs";
import { createPatchEngine } from "../app/patch-engine.js";
import { createPublishedSource } from "../app/content-loader.js";
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
        }
    };

    Object.entries(options.attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));

    return element;
}

function installBrowserGlobals({ reducedMotion = false, hash = "#/resume", scrollY = 0, activeElement = null } = {}) {
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

const source = readSource();
const configSource = fs.readFileSync("config.js", "utf8");
const scriptSource = fs.readFileSync("script.js", "utf8");
const patchEngineSource = fs.readFileSync("app/patch-engine.js", "utf8");
const patchCss = fs.readFileSync("styles/patch.css", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");

{
    assert.match(configSource, /pageRailTransition\s*:/, "config.js exposes a dedicated page→page rail transition config");
    assert.match(patchEngineSource, /runPageRailTransition\s*\(/, "patch engine exposes a dedicated page→page rail transition runner");
    assert.match(scriptSource, /runPageRailTransition\(/, "script wires section-to-section navigation into the page→page transition runner");
    assert.match(shellCss + patchCss, /\[data-route-transition="page-rail"\]/, "CSS styles a dedicated page→page rail transition state");
}

{
    const app = { innerHTML: "", setAttribute() {} };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => "resume"
    });

    renderer.renderApp(source.languages.it);
    assert.match(app.innerHTML, /data-page-rail-frame/, "non-Home public views render inside a persistent page-frame marker");
    assert.doesNotMatch(app.innerHTML, /data-home-enter-frame/, "normal page rendering does not inject the Home-only frame marker");

    renderer.renderPageRailFrame(source.languages.it, "resume", "blog", { phase: "entering", timing: { exitMs: 90, enterMs: 140 } });
    assert.match(app.innerHTML, /data-route-transition="page-rail"/, "page→page render surface exposes the page-rail transition marker");
    assert.match(app.innerHTML, /data-route-phase="entering"/, "page→page render surface exposes the entering phase");
    assert.match(app.innerHTML, /data-page-rail-page="from"/, "page→page render includes the outgoing page surface");
    assert.match(app.innerHTML, /data-page-rail-page="to"/, "page→page render includes the incoming page surface");
    assert.doesNotMatch(app.innerHTML, /data-home-enter-frame/, "page→page transition does not reuse the Home-only frame renderer");
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
    const shell = createElement();
    const languageGlobe = createElement({ tagName: "BUTTON" });
    const phases = [];
    const railCalls = [];
    let renderCount = 0;
    let homeEnterFrameCalls = 0;

    installBrowserGlobals({ reducedMotion: false, hash: "#/resume", scrollY: 180, activeElement: languageGlobe });

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
        getPageRailTimingConfig: () => ({ exitMs: 1, enterMs: 1 }),
        renderPageRailFrame: (_data, fromView, toView, details) => {
            railCalls.push({ fromView, toView, phase: details.phase });
        },
        renderHomeEnterFrame: () => {
            homeEnterFrameCalls += 1;
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
        setRouteHash: (view) => {
            window.location.hash = `#/${view}`;
        },
        setRouteTransitionState: (name, phase) => {
            shell.setAttribute("data-route-transition", name || "idle");
            shell.setAttribute("data-route-phase", phase || "idle");
            languageGlobe.setAttribute("aria-disabled", String(Boolean(state.isPatching || state.isRouteTransitioning)));
            phases.push({ name, phase, hash: window.location.hash, globeDisabled: languageGlobe.getAttribute("aria-disabled") });
        },
        isReducedMotion: () => false
    });

    const result = await patchEngine.runPageRailTransition("blog", { triggerElement: languageGlobe });

    assert.equal(result.started, true, "page→page transition starts from an already active public page");
    assert.deepEqual(phases.map((entry) => `${entry.name}:${entry.phase}`), ["page-rail:exiting", "page-rail:entering", "idle:idle"], "page→page transition runs through exiting → entering → idle");
    assert.ok(phases.slice(0, 2).every((entry) => entry.hash === "#/blog"), "target hash route is already selected during active page→page phases");
    assert.ok(phases.slice(0, 2).every((entry) => entry.globeDisabled === "true"), "language globe stays disabled during active page→page phases");
    assert.equal(phases.at(-1).globeDisabled, "false", "language globe unlocks again when the page→page transition returns to idle");
    assert.deepEqual(railCalls, [
        { fromView: "resume", toView: "blog", phase: "exiting" },
        { fromView: "resume", toView: "blog", phase: "entering" }
    ], "page→page transition renders outgoing and incoming rail phases only");
    assert.equal(homeEnterFrameCalls, 0, "page→page transition never calls the Home-only frame renderer");
    assert.equal(renderCount, 1, "final target page render runs once after the rail swap");
    assert.equal(currentViewRef.value, "blog", "target page becomes current by the end of the page→page transition");
    assert.equal(window.scrollY, 180, "page→page transition restores scroll context");
    assert.equal(languageGlobe.focused, true, "focus returns to the initiating control after page→page transition");
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

    installBrowserGlobals({ reducedMotion: false, hash: "#/" });

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
        getPageRailTimingConfig: () => ({ exitMs: 1, enterMs: 1 }),
        renderPageRailFrame: () => {},
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

    const result = await patchEngine.runPageRailTransition("blog", { triggerElement: createElement({ tagName: "BUTTON" }) });
    assert.equal(result.started, false, "Home does not use the page→page rail transition lifecycle");
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
    let railRenderCount = 0;
    let renderCount = 0;

    installBrowserGlobals({ reducedMotion: true, hash: "#/resume" });

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
            throw new Error("reduced-motion page→page transition should not request patch timing");
        },
        getPageRailTimingConfig: () => ({ exitMs: 1, enterMs: 1 }),
        renderPageRailFrame: () => {
            railRenderCount += 1;
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
        setRouteHash: (view) => {
            window.location.hash = `#/${view}`;
        },
        setRouteTransitionState: () => {},
        isReducedMotion: () => true
    });

    const result = await patchEngine.runPageRailTransition("resources", { triggerElement: createElement({ tagName: "BUTTON" }) });
    assert.equal(result.started, true, "reduced-motion page→page transition still starts");
    assert.equal(result.reducedMotion, true, "reduced-motion page→page path reports direct render");
    assert.equal(railRenderCount, 0, "reduced-motion page→page path skips staged rail rendering");
    assert.equal(renderCount, 1, "reduced-motion page→page path lands directly on the target render");
}

console.log("SBR-019 public page-to-page persistent-frame rail navigation assertions passed");
