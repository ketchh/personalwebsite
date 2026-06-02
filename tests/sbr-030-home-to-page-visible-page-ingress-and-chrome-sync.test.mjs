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
        contains: (name) => classes.has(name)
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
        setAttribute(name, value) {
            attributes.set(name, String(value));
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
            if (name.startsWith("data-")) {
                const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                delete element.dataset[key];
            }
        },
        focus() {
            if (globalThis.document) {
                globalThis.document.activeElement = element;
            }
        }
    };

    Object.entries(options.attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));

    return element;
}

function installBrowserGlobals({ reducedMotion = false, hash = "#/", activeElement = null } = {}) {
    const body = createElement({ tagName: "BODY", attributes: { "data-current-section": "home" } });
    const shell = createElement({ tagName: "DIV", attributes: { "data-current-section": "home" } });

    globalThis.window = {
        location: { hash },
        scrollX: 0,
        scrollY: 0,
        setTimeout,
        clearTimeout,
        matchMedia: () => ({ matches: reducedMotion }),
        scrollTo() {}
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

    return { body, shell };
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
            const frame = createElement({ dataset: { homeEnterFrame: "true", homeEnterView: view } });
            const heading = createElement({ tagName: "H1", attributes: { "data-route-heading": "", "data-home-enter-field": "heading" } });
            const copy = createElement({ tagName: "P", attributes: { "data-home-enter-field": "copy" } });
            elements.set("[data-home-enter-frame]", frame);
            elements.set('[data-home-enter-field="heading"]', heading);
            elements.set('[data-home-enter-field="copy"]', copy);
            return { frame, heading, copy };
        }
    };
}

const source = readSource();
const patchEngineSource = fs.readFileSync("app/patch-engine.js", "utf8");
const scriptSource = fs.readFileSync("script.js", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const introCss = fs.readFileSync("styles/intro.css", "utf8");

assert.match(shellCss, /body\[data-current-section="home"\]\[data-route-transition="home-enter"\] \.shell[\s\S]*display:\s*(block|grid)/, "shell becomes visible during home-enter even while currentSection is still home so the page can start entering before chrome settles");
assert.match(shellCss, /body\[data-route-transition="home-enter"\] \.topbar[\s\S]*opacity:\s*0/s, "active home-enter keeps top chrome hidden so it cannot settle before the destination page build is visibly underway");
assert.match(shellCss, /body\[data-route-transition="home-enter"\] \.topbar[\s\S]*visibility:\s*hidden/s, "active home-enter removes the hidden top chrome from tab order while it is visually withheld");
assert.match(shellCss, /body\[data-route-transition="home-enter"\]\[data-route-phase="content"\] \.topbar[\s\S]*opacity:\s*1/s, "content phase is where top chrome becomes visible again once the destination page ingress is already underway");
assert.match(shellCss, /body\[data-route-transition="home-enter"\]\[data-route-phase="content"\] \.topbar[\s\S]*visibility:\s*visible/s, "content phase restores the destination chrome only when it is meant to become visible and interactive");
assert.match(shellCss, /\[data-route-transition="home-enter"\]\[data-route-phase="content"\] \.home-enter-selection,[\s\S]*\.home-enter-frame-card[\s\S]*position:\s*absolute/s, "content phase removes the temporary selection/frame card from normal layout so the real destination page can occupy the live route position before idle");
assert.match(introCss, /body\[data-route-transition="home-enter"\]\[data-route-phase="frame"\] \.site-intro[\s\S]*position:\s*fixed/s, "frame phase removes the withdrawn Home intro from normal layout so the destination shell is not pushed below the viewport");
assert.match(introCss, /body\[data-route-transition="home-enter"\]\[data-route-phase="content"\] \.site-intro[\s\S]*position:\s*fixed/s, "content phase keeps the withdrawn Home intro out of layout until the final route render hides it");
assert.match(introCss, /body\[data-route-transition="home-enter"\]\[data-route-phase="frame"\] \.site-intro,[\s\S]*body\[data-route-transition="home-enter"\]\[data-route-phase="content"\] \.site-intro\s*\{[\s\S]*visibility:\s*hidden/s, "frame/content phases remove the visually withdrawn Home intro choices from tab order while destination controls are mounted");
assert.match(scriptSource, /resumeShell\.dataset\.currentSection|document\.body\.dataset\.currentSection/, "chrome sync can follow the visible current section instead of the hash alone during staged Home→page ingress");
assert.match(patchEngineSource, /setRouteLifecycle\("home-enter", "frame"[\s\S]*await wait\(config\.frameRevealMs[\s\S]*syncCurrentSection\(targetView\)[\s\S]*setRouteLifecycle\("home-enter", "content"/s, "Home→page transition now keeps the visible section on Home through frame reveal, then syncs destination chrome when content ingress begins");

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
    const { body, shell } = installBrowserGlobals({ reducedMotion: false, hash: "#/", activeElement: triggerElement });
    const { app, setFrameElements } = createHomeEnterApp();
    const phases = [];

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
        renderHomeEnterFrame: (_data, view) => {
            setFrameElements(view);
        },
        renderApp: () => {},
        renderContentError: () => {},
        applyUiText: () => {},
        setGroupPatchState: () => {},
        syncCurrentSection: (view) => {
            currentViewRef.value = view;
            body.setAttribute("data-current-section", view);
            shell.setAttribute("data-current-section", view);
        },
        setRouteHash: (view) => {
            window.location.hash = `#/${view}`;
        },
        setRouteTransitionState: (name, phase) => {
            phases.push({
                name,
                phase,
                currentView: currentViewRef.value,
                currentHash: window.location.hash,
                bodySection: body.getAttribute("data-current-section"),
                shellSection: shell.getAttribute("data-current-section")
            });
        },
        isReducedMotion: () => false
    });

    const result = await patchEngine.runHomeEnterTransition("resume", { triggerElement });

    assert.equal(result.started, true, "Home→page transition still starts normally");
    assert.deepEqual(phases.map((entry) => entry.phase), ["clearing", "frame", "content", "idle"], "Home→page transition keeps the expected lifecycle");
    assert.equal(phases[0].currentHash, "#/resume", "target hash is still selected immediately so direct routing remains intact");
    assert.equal(phases[0].currentView, "home", "clearing still begins from Home");
    assert.equal(phases[1].currentView, "home", "frame reveal keeps visible current section on Home so chrome does not settle before the page build is underway");
    assert.equal(phases[1].bodySection, "home", "frame reveal still reports Home on the visible shell/body state");
    assert.equal(phases[2].currentView, "resume", "content phase is the first point where destination chrome/current section settles");
    assert.equal(phases[2].bodySection, "resume", "content phase syncs the visible shell/body state to the destination section");
}

console.log("SBR-030 home-to-page visible page ingress and chrome sync assertions passed");
