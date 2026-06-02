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
            if (name.startsWith("data-")) {
                const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                delete element.dataset[key];
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
    const body = createElement({ tagName: "BODY", attributes: { "data-current-section": "home" } });

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
        body,
        documentElement: {
            lang: "it",
            setAttribute(name, value) {
                this[name] = String(value);
            }
        },
        activeElement,
        contains: () => true
    };

    return { body };
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
        setFrameElements(view, phase) {
            const frame = createElement({ dataset: { homeEnterFrame: "true", homeEnterView: view, frameOrigin: "center" } });
            const selection = createElement({ dataset: { homeEnterSelection: "true", homeEnterView: view, homeEnterPhase: phase } });
            const heading = createElement({ tagName: "H1", attributes: { "data-route-heading": "", "data-home-enter-field": "heading" } });
            const copy = createElement({ tagName: "P", attributes: { "data-home-enter-field": "copy" } });
            elements.set("[data-home-enter-frame]", frame);
            elements.set("[data-home-enter-selection]", selection);
            elements.set('[data-home-enter-field="heading"]', heading);
            elements.set('[data-home-enter-field="copy"]', copy);
            return { frame, selection, heading, copy };
        }
    };
}

const source = readSource();
const patchEngineSource = fs.readFileSync("app/patch-engine.js", "utf8");
const renderSource = fs.readFileSync("app/render.js", "utf8");
const introCss = fs.readFileSync("styles/intro.css", "utf8");
const patchCss = fs.readFileSync("styles/patch.css", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");

{
    assert.match(renderSource, /data-home-enter-selection/, "renderer exposes a deterministic selected-choice handoff marker for Home→page transitions");
    assert.match(renderSource, /data-home-enter-page-surface/, "renderer also exposes a deterministic destination-page ingress surface during Home→page transitions");
    assert.match(renderSource, /data-home-enter-live-route/, "renderer now also exposes a deterministic live-route continuity surface for the final handoff into the real page");
    assert.match(patchEngineSource, /data-home-enter-selected|homeEnterSelected/i, "patch engine manages deterministic selected-choice handoff state");
    assert.match(introCss + patchCss + shellCss, /home-enter-selection|data-home-enter-selected/i, "CSS styles the selected-choice handoff state instead of letting the choice vanish instantly");
    assert.match(shellCss + patchCss, /home-enter-page-surface|data-home-enter-page-surface/, "CSS styles the destination-page ingress surface so the page itself starts entering before the final route render");
    assert.match(shellCss + patchCss, /home-enter-live-route|data-home-enter-live-route/, "CSS also styles the live-route continuity surface so the final route no longer snaps in after the staged build");
    assert.match(introCss, /site-intro-title[\s\S]*opacity:\s*0/s, "intro CSS also withdraws the lingering Home greeting so the handoff no longer stalls under the old intro line");
    assert.match(introCss, /intro-cursor[\s\S]*opacity:\s*0/s, "intro CSS also withdraws the blinking Home cursor during the active handoff");
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
    const triggerElement = createElement({ tagName: "A", dataset: { sectionChoice: "resume" } });
    const shell = createElement();
    const languageGlobe = createElement({ tagName: "BUTTON" });
    const { body } = installBrowserGlobals({ reducedMotion: false, hash: "#/", scrollY: 120, activeElement: triggerElement });
    const { app, setFrameElements } = createHomeEnterApp();
    const phases = [];
    const frameCalls = [];
    let renderCount = 0;

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
        getHomeEnterTimingConfig: () => ({ studyFrameRevealMs: 100, frameRevealMs: 70, clearingMs: 1, headingGranularity: "char", copyGranularity: "word", direction: "forward" }),
        getHomeEnterRevealPayload: (data, view) => ({
            headingText: view === "resume" ? data.hero.name : data.sectionChooser.choices.find((choice) => choice.key === view).label,
            copyText: view === "resume" ? data.hero.summary : data.sectionChooser.choices.find((choice) => choice.key === view).copy
        }),
        buildRenderableFields: () => [],
        renderHomeEnterFrame: (_data, view, details) => {
            frameCalls.push({ view, phase: details.phase });
            setFrameElements(view, details.phase);
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
            body.dataset.currentSection = view;
            body.setAttribute("data-current-section", view);
        },
        setRouteHash: (view) => {
            window.location.hash = `#/${view}`;
        },
        setRouteTransitionState: (name, phase) => {
            shell.setAttribute("data-route-transition", name || "idle");
            shell.setAttribute("data-route-phase", phase || "idle");
            languageGlobe.setAttribute("aria-disabled", String(Boolean(state.isPatching || state.isRouteTransitioning)));
            phases.push({
                name,
                phase,
                currentView: currentViewRef.value,
                currentHash: window.location.hash,
                selected: body.getAttribute("data-home-enter-selected"),
                selectionPhase: body.getAttribute("data-home-enter-selection-phase"),
                globeDisabled: languageGlobe.getAttribute("aria-disabled")
            });
        },
        isReducedMotion: () => false
    });

    const result = await patchEngine.runHomeEnterTransition("resume", { triggerElement });

    assert.equal(result.started, true, "Home→page handoff starts from the intro-only Home state");
    assert.deepEqual(phases.map((entry) => entry.phase), ["clearing", "frame", "content", "idle"], "Home→page handoff still uses the deterministic lifecycle");
    assert.equal(phases[0].currentView, "home", "clearing still starts from the intro-only Home state before page chrome appears");
    assert.equal(phases[0].currentHash, "#/resume", "target hash is selected before the clearing phase finishes");
    assert.equal(phases[0].selected, "resume", "selected-choice handoff state is present during clearing so the choice does not vanish into a blank gap");
    assert.equal(phases[1].currentView, "home", "frame reveal keeps the visible shell on Home so the destination chrome does not settle before the page build is underway");
    assert.equal(phases[1].selected, "resume", "selected-choice handoff state remains present when the destination frame appears");
    assert.equal(phases[2].currentView, "resume", "destination chrome settles when the transition reaches content, after the page ingress has started");
    assert.ok(phases.slice(0, 3).every((entry) => entry.globeDisabled === "true"), "language control stays locked during the active handoff phases");
    assert.equal(phases.at(-1).globeDisabled, "false", "language control unlocks when the handoff returns to idle");
    assert.deepEqual(frameCalls, [
        { view: "resume", phase: "frame" }
    ], "frame render remains a single DOM build so the outline handoff is promoted without restarting visual motion");
    assert.equal(renderCount, 1, "final target render still runs once after the staged handoff");
    assert.equal(body.getAttribute("data-home-enter-selected"), null, "selected-choice handoff state clears when the transition finishes");
    assert.equal(currentViewRef.value, "resume", "destination route becomes current by the end of the handoff");
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
    const triggerElement = createElement({ tagName: "A", dataset: { sectionChoice: "blog" } });
    const { body } = installBrowserGlobals({ reducedMotion: true, hash: "#/", scrollY: 12, activeElement: triggerElement });
    const phases = [];
    let renderCount = 0;
    let frameRenderCount = 0;

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
        getHomeEnterTimingConfig: () => ({ studyFrameRevealMs: 100, frameRevealMs: 70, clearingMs: 1, headingGranularity: "char", copyGranularity: "word", direction: "forward" }),
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
            body.dataset.currentSection = view;
            body.setAttribute("data-current-section", view);
        },
        setRouteHash: (view) => {
            window.location.hash = `#/${view}`;
        },
        setRouteTransitionState: (name, phase) => {
            phases.push({
                name,
                phase,
                selected: body.getAttribute("data-home-enter-selected"),
                selectionPhase: body.getAttribute("data-home-enter-selection-phase"),
                currentView: currentViewRef.value,
                currentHash: window.location.hash
            });
        },
        isReducedMotion: () => true
    });

    const result = await patchEngine.runHomeEnterTransition("blog", { triggerElement });

    assert.equal(result.started, true, "reduced-motion Home→page handoff still lands on the target route");
    assert.equal(result.reducedMotion, true, "reduced-motion path reports direct landing");
    assert.equal(frameRenderCount, 0, "reduced-motion path skips the staged frame renderer entirely");
    assert.equal(renderCount, 1, "reduced-motion path renders the destination once");
    assert.ok(phases.every((entry) => entry.name === "idle" || entry.phase === "idle"), "reduced-motion landing never emits a staged home-enter lifecycle");
    assert.ok(phases.every((entry) => entry.selected === null), "reduced-motion landing never exposes selected-choice handoff state");
    assert.equal(currentViewRef.value, "blog", "reduced-motion landing still ends on the requested destination");
}

console.log("SBR-026 home-to-page handoff repair assertions passed");
