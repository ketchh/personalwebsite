import assert from "node:assert/strict";
import fs from "node:fs";
import { createControlsController, applyLanguagePatchState } from "../app/controls.js";
import { createPatchEngine } from "../app/patch-engine.js";
import { createPublishedSource, PUBLIC_CONTACT_EMAIL } from "../app/content-loader.js";
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
    const listeners = new Map();
    const element = {
        tagName: options.tagName || "SPAN",
        dataset: { ...(options.dataset || {}) },
        classList: createClassList(options.classNames || []),
        textContent: options.textContent || "",
        innerHTML: options.innerHTML || "",
        focused: false,
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.has(name) ? attributes.get(name) : null;
        },
        removeAttribute(name) {
            attributes.delete(name);
        },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        click() {
            const listener = listeners.get("click");
            if (listener) {
                listener({ currentTarget: element });
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

function createRuntimeConfig() {
    return {
        patchGranularityFallback: {
            line: { short: "line", long: "line by line" },
            word: { short: "word", long: "word by word" },
            char: { short: "char", long: "letter by letter" }
        },
        patchDirectionFallback: {
            forward: { short: "forward", long: "from start to end" },
            reverse: { short: "reverse", long: "from end to start" }
        },
        patchStreamConfig: {
            line: { stepDelay: 1, holdDelay: 1, groupStagger: 1, groupPause: 1 },
            word: { stepDelay: 1, holdDelay: 1, groupStagger: 1, groupPause: 1 },
            char: { stepDelay: 1, holdDelay: 1, groupStagger: 1, groupPause: 1 }
        },
        patchSpeedPresetFallback: {
            1: { short: "fast", long: "faster", multiplier: 1 },
            2: { short: "normal", long: "normal speed", multiplier: 1 },
            3: { short: "slow", long: "slower", multiplier: 1 },
            4: { short: "very slow", long: "much slower", multiplier: 1 }
        },
        validateLanguageShape: () => true,
        validateRenderableTransition(fromFields, toFields) {
            return fromFields.length === toFields.length && fromFields.every((field, index) => field.key === toFields[index].key);
        },
        warnMissingPatchElement: () => {}
    };
}

function createLifecycleRefs() {
    return {
        langSwitch: createElement({ dataset: {} }),
        languageStatus: createElement(),
        statusChip: createElement(),
        statusRight: createElement(),
        langButtons: [
            createElement({ dataset: { lang: "it" }, classNames: ["lang-button", "is-active"] }),
            createElement({ dataset: { lang: "en" }, classNames: ["lang-button"] })
        ]
    };
}

const source = readSource();
const indexHtml = fs.readFileSync("index.html", "utf8");
const scriptSource = fs.readFileSync("script.js", "utf8");

{
    assert.match(indexHtml, /id="language-status"/, "public shell includes a language status element");
    assert.match(indexHtml, /id="language-status"[^>]*role="status"/, "language status uses role=status");
    assert.match(indexHtml, /id="language-status"[^>]*aria-live="polite"/, "language status is an aria-live region");
    const statusTag = indexHtml.match(/<[^>]+id="language-status"[^>]*>/)?.[0] || "";
    assert.doesNotMatch(statusTag, /aria-hidden="true"/, "language status is not hidden from assistive tech");
    assert.match(scriptSource, /applyLanguagePatchState/, "public script wires the shared language patch state helper");
    assert.match(scriptSource, /languageStatus:\s*document\.getElementById\("language-status"\)/, "public script captures the live language status element");
    assert.match(scriptSource, /setLanguagePatchState\("idle",\s*\{\s*toLang:\s*state\.currentLang\s*\}\)/, "public script sets initial idle language state after first render");
    assert.match(scriptSource, /setLanguagePatchState\s*\n?\s*\}/, "public script passes language lifecycle state into the patch engine");
    assert.match(scriptSource, /patchEngine\.runPatch\(nextLang,\s*options\s*\|\|\s*\{\}\)/, "public script forwards the initiating control context to the patch engine");
}

{
    const state = {
        currentLang: "it",
        isPatching: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3"
    };
    const refs = createLifecycleRefs();
    const controls = createControlsController({
        refs: {
            patchSelectorLabel: null,
            patchDirectionLabel: null,
            patchSpeedLabel: null,
            patchSpeedSlider: null,
            patchSpeedValue: null,
            statusRight: refs.statusRight,
            langButtons: refs.langButtons,
            patchGranularityButtons: [],
            patchDirectionButtons: []
        },
        state,
        source,
        runtimeConfig: createRuntimeConfig()
    });

    controls.syncUi(source.languages.it);
    applyLanguagePatchState(refs, state, "idle", { toLang: "it" });

    assert.equal(refs.langButtons[0].getAttribute("aria-pressed"), "true", "initial active language has aria-pressed=true");
    assert.ok(refs.langButtons[0].classList.contains("is-active"), "initial active language has .is-active");
    assert.equal(refs.langButtons[1].getAttribute("aria-pressed"), "false", "initial inactive language has aria-pressed=false");
    assert.equal(refs.langSwitch.getAttribute("data-patch-state"), "idle", "initial language switch state is idle");
    assert.equal(refs.languageStatus.getAttribute("data-patch-state"), "idle", "initial language status is idle");
    assert.match(refs.languageStatus.textContent, /language it .*idle|language it .*ready/i, "initial language status announces ready/idle");
}

{
    const state = {
        currentLang: "it",
        isPatching: false,
        patchGranularity: "word",
        patchDirection: "forward",
        patchSpeedPreset: "2"
    };
    const refs = createLifecycleRefs();
    installBrowserGlobals({ reducedMotion: false, hash: "#/resume", scrollY: 512, activeElement: refs.langButtons[1] });

    const fieldElement = createElement({ textContent: "Codice chiaro" });
    const app = {
        querySelector(selector) {
            if (selector === '[data-patch-key="hero-title"]') {
                return fieldElement;
            }
            return createElement();
        }
    };
    const phases = [];
    let renderCount = 0;
    const patchEngine = createPatchEngine({
        app,
        state,
        getLanguageEntry: (requestedKey) => ({
            key: requestedKey,
            data: {
                htmlLang: requestedKey,
                ui: { statusRight: `translation::${requestedKey}` }
            }
        }),
        validateLanguageShape: () => true,
        validateRenderableTransition: createRuntimeConfig().validateRenderableTransition,
        warnMissingPatchElement: () => {},
        statusChip: refs.statusChip,
        statusRight: refs.statusRight,
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "forward", long: "from start to end" }),
        getSpeedPreset: () => ({ short: "normal", long: "normal speed", multiplier: 1 }),
        getTimingConfig: () => ({ stepDelay: 1, holdDelay: 1, groupStagger: 1, groupPause: 1 }),
        buildRenderableFields: (data) => [
            {
                key: "hero-title",
                text: data.htmlLang === "it" ? "Codice chiaro" : "Clear code",
                group: "hero"
            }
        ],
        renderApp: () => {
            renderCount += 1;
        },
        applyUiText: (data) => {
            document.documentElement.lang = data.htmlLang;
        },
        setGroupPatchState: () => {},
        setLanguagePatchState: (phase, details) => {
            applyLanguagePatchState(refs, state, phase, details);
            phases.push({ phase, text: refs.languageStatus.textContent });
            if (phase === "patching") {
                assert.equal(fieldElement.textContent, "Codice chiaro", "patching state is set before localized text changes");
                assert.equal(refs.langSwitch.getAttribute("data-patch-state"), "patching", "language switch exposes patching state");
                assert.equal(refs.langButtons[0].getAttribute("aria-disabled"), "true", "IT button is disabled while patching");
                assert.equal(refs.langButtons[1].getAttribute("aria-disabled"), "true", "EN button is disabled while patching");
                assert.match(refs.languageStatus.textContent, /it\s*->\s*en/i, "patching status includes source and target keys");
            }
        },
        isReducedMotion: () => false
    });

    const firstPatch = patchEngine.runPatch("en", { triggerElement: refs.langButtons[1] });
    const concurrentPatch = await patchEngine.runPatch("en", { triggerElement: refs.langButtons[0] });
    const firstResult = await firstPatch;

    assert.equal(concurrentPatch.started, false, "second patch is ignored while patching is active");
    assert.equal(firstResult.started, true, "first patch starts normally");
    assert.deepEqual(phases.map((entry) => entry.phase), ["patching", "complete", "idle"], "patch lifecycle is patching -> complete -> idle");
    assert.equal(document.documentElement.lang, "en", "document language reflects completed target language");
    assert.equal(state.currentLang, "en", "selected language is retained after returning to idle");
    assert.ok(refs.langButtons[1].classList.contains("is-active"), "EN button is active after completion");
    assert.equal(refs.langButtons[1].getAttribute("aria-pressed"), "true", "EN button aria-pressed is true after completion");
    assert.equal(refs.langSwitch.getAttribute("data-patch-state"), "idle", "language switch returns to idle after completion");
    assert.equal(refs.langButtons[0].getAttribute("aria-disabled"), "false", "buttons are re-enabled after idle");
    assert.match(refs.languageStatus.textContent, /en.*(complete|idle)|en.*ready/i, "final status announces target language and idle/completion");
    assert.equal(fieldElement.textContent, "Clear code", "visible localized content reflects target language");
    assert.equal(window.scrollY, 512, "scroll context is restored after animated patch");
    assert.equal(refs.langButtons[1].focused, true, "focus returns to the initiating language button");
    assert.equal(renderCount, 0, "normal patch animation does not direct-render the whole route");
}

{
    const state = {
        currentLang: "it",
        isPatching: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3"
    };
    const refs = createLifecycleRefs();
    installBrowserGlobals({ reducedMotion: true, hash: "#/resources", scrollY: 640, activeElement: refs.langButtons[1] });

    const app = { innerHTML: "", querySelector: () => null };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => window.location.hash.replace(/^#\/?/, "") || "home"
    });
    renderer.renderApp(source.languages.it);

    const patchEngine = createPatchEngine({
        app,
        state,
        getLanguageEntry: (requestedKey) => ({ key: requestedKey, data: source.languages[requestedKey] }),
        validateLanguageShape: () => true,
        validateRenderableTransition: createRuntimeConfig().validateRenderableTransition,
        warnMissingPatchElement: () => {},
        statusChip: refs.statusChip,
        statusRight: refs.statusRight,
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "reverse", long: "from end to start" }),
        getSpeedPreset: () => ({ short: "slow", long: "slower", multiplier: 1 }),
        getTimingConfig: () => {
            throw new Error("reduced-motion patch should not request per-token timing");
        },
        buildRenderableFields: renderer.buildRenderableFields,
        renderApp: renderer.renderApp,
        applyUiText: (data) => {
            document.documentElement.lang = data.htmlLang;
        },
        renderContentError: renderer.renderContentError,
        setGroupPatchState: renderer.setGroupPatchState,
        setLanguagePatchState: (phase, details) => applyLanguagePatchState(refs, state, phase, details),
        isReducedMotion: () => true
    });

    const result = await patchEngine.runPatch("en", { triggerElement: refs.langButtons[1] });

    assert.equal(result.started, true, "reduced-motion patch still starts");
    assert.equal(window.location.hash, "#/resources", "language switch preserves the current hash route");
    assert.match(app.innerHTML, /data-page-rail-frame/, "route render remains inside the persistent non-home page frame");
    assert.doesNotMatch(app.innerHTML, /chooser-card is-compact/, "non-home route render no longer prepends the compact chooser");
    assert.match(app.innerHTML, /data-patch-group="view-resources"/, "Resources view remains rendered after language switch");
    assert.doesNotMatch(app.innerHTML, /patch-fragment--remove|patch-fragment--add/, "reduced-motion switch does not render patch fragments");
    assert.equal(document.documentElement.lang, "en", "reduced-motion switch updates document language");
    assert.equal(window.scrollY, 640, "reduced-motion switch preserves scroll within tolerance");
    assert.equal(refs.langButtons[1].focused, true, "reduced-motion switch restores focus to initiating language button");
    assert.match(refs.languageStatus.textContent, /en.*(complete|idle)|en.*ready/i, "reduced-motion switch announces completion/idle");
}

{
    const state = {
        currentLang: "it",
        isPatching: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3"
    };
    const refs = createLifecycleRefs();
    installBrowserGlobals({ reducedMotion: false, hash: "#/resume", scrollY: 0, activeElement: refs.langButtons[1] });
    const app = { innerHTML: "", querySelector: () => null };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => "resume"
    });
    renderer.renderApp(source.languages.it);

    const patchEngine = createPatchEngine({
        app,
        state,
        getLanguageEntry: (requestedKey) => ({ key: requestedKey, data: source.languages[requestedKey] }),
        validateLanguageShape: () => true,
        validateRenderableTransition: () => false,
        warnMissingPatchElement: () => {},
        statusChip: refs.statusChip,
        statusRight: refs.statusRight,
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "reverse", long: "from end to start" }),
        getSpeedPreset: () => ({ short: "slow", long: "slower", multiplier: 1 }),
        getTimingConfig: () => ({ stepDelay: 1, holdDelay: 1, groupStagger: 1, groupPause: 1 }),
        buildRenderableFields: renderer.buildRenderableFields,
        renderApp: renderer.renderApp,
        applyUiText: () => {},
        renderContentError: renderer.renderContentError,
        setGroupPatchState: renderer.setGroupPatchState,
        setLanguagePatchState: (phase, details) => applyLanguagePatchState(refs, state, phase, details),
        isReducedMotion: () => false
    });

    const result = await patchEngine.runPatch("en", { triggerElement: refs.langButtons[1] });

    assert.equal(result.started, false, "mismatched renderable fields block language patching");
    assert.match(app.innerHTML, /content-error-card/, "mismatched fields render the content-unavailable state");
    assert.match(app.innerHTML, new RegExp(PUBLIC_CONTACT_EMAIL.replaceAll(".", "\\.")), "content-unavailable state keeps the email visible");
    assert.match(app.innerHTML, new RegExp(`href=\"mailto:${PUBLIC_CONTACT_EMAIL.replaceAll(".", "\\.")}\"`), "content-unavailable state keeps the mailto link");
    assert.equal(state.currentLang, "it", "failed patch does not silently switch languages");
}

console.log("SBR-004 language patch state/context assertions passed");
