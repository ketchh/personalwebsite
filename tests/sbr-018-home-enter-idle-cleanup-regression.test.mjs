import assert from "node:assert/strict";
import { createPatchEngine } from "../app/patch-engine.js";
import { createPublishedSource } from "../app/content-loader.js";
import fs from "node:fs";

function readSource() {
    return createPublishedSource(JSON.parse(fs.readFileSync("data/published.json", "utf8")));
}

function createElement() {
    const attributes = new Map();
    return {
        focused: false,
        tagName: "DIV",
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.has(name) ? attributes.get(name) : null;
        },
        focus() {
            this.focused = true;
            if (globalThis.document) {
                globalThis.document.activeElement = this;
            }
        }
    };
}

function installBrowserGlobals() {
    globalThis.window = {
        location: { hash: "#/" },
        scrollX: 0,
        scrollY: 0,
        setTimeout,
        clearTimeout,
        matchMedia: () => ({ matches: false }),
        scrollTo() {}
    };

    globalThis.document = {
        documentElement: {
            lang: "it",
            setAttribute(name, value) {
                this[name] = String(value);
            }
        },
        activeElement: null,
        contains: () => true
    };
}

const source = readSource();
installBrowserGlobals();

const currentViewRef = { value: "home" };
const state = {
    currentLang: "it",
    isPatching: false,
    isRouteTransitioning: false,
    patchGranularity: "word",
    patchDirection: "reverse",
    patchSpeedPreset: "3"
};
const lifecycle = [];
const app = {
    querySelector(selector) {
        if (selector === '[data-home-enter-field="heading"]' || selector === '[data-home-enter-field="copy"]') {
            return createElement();
        }
        return null;
    }
};

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
    getHomeEnterRevealPayload: () => ({ headingText: "Resume", copyText: "Copy" }),
    renderHomeEnterFrame: () => {},
    renderApp: () => {},
    renderContentError: () => {},
    applyUiText: () => {},
    setGroupPatchState: () => {},
    syncCurrentSection: (view) => {
        currentViewRef.value = view;
    },
    setRouteTransitionState: (name, phase) => {
        lifecycle.push({ name, phase });
    },
    isReducedMotion: () => false
});

await patchEngine.runHomeEnterTransition("resume", { triggerElement: createElement() });

assert.deepEqual(lifecycle.at(-1), { name: "idle", phase: "idle" }, "after completion, the shell must leave the Home→page lifecycle entirely instead of staying tagged as home-enter");

console.log("SBR-018 home-enter idle cleanup regression assertions passed");
