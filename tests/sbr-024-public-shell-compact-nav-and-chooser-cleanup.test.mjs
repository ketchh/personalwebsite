import assert from "node:assert/strict";
import fs from "node:fs";
import { buildShellNavigationFields } from "../app/controls.js";
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
        },
        querySelector() {
            return null;
        }
    };

    Object.entries(options.attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));

    return element;
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

function renderView(source, languageKey, view) {
    const app = { innerHTML: "", setAttribute() {} };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => view
    });

    renderer.renderApp(source.languages[languageKey]);

    return { html: app.innerHTML, renderer, app };
}

const source = readSource();
const indexHtml = fs.readFileSync("index.html", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const responsiveCss = fs.readFileSync("styles/responsive.css", "utf8");

{
    const { html: homeHtml, renderer: homeRenderer } = renderView(source, "it", "home");
    const { html: resumeHtml, renderer: resumeRenderer } = renderView(source, "it", "resume");

    assert.match(homeHtml, /data-current-section="home"/, "Home route still exposes the active section marker");
    assert.doesNotMatch(homeHtml, /chooser-card|data-patch-group="chooser"|data-section-choice="resume"/, "Home app mount no longer renders a second chooser/dashboard surface");
    assert.doesNotMatch(homeHtml, /hero-card|facts-card|view-card|data-page-rail-frame|statusbar/, "Home app mount stays free of inner-page frame/content surfaces");
    assert.deepEqual(homeRenderer.buildRenderableFields(source.languages.it), [], "Home renderer exposes no in-app chooser patch fields");

    assert.match(resumeHtml, /data-page-rail-frame/, "non-Home public views still render inside the persistent page frame");
    assert.doesNotMatch(resumeHtml, /chooser-card|data-patch-group="chooser"|data-section-choice="resume"/, "non-Home public routes no longer prepend the chooser/dashboard block");
    assert.ok(resumeRenderer.buildRenderableFields(source.languages.it).every((field) => !field.key.startsWith("chooser-")), "non-Home renderable fields exclude chooser patch keys");
}

{
    const navRowBlock = shellCss.match(/\[data-shell-nav="sections"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
    const navLinkBlock = shellCss.match(/\[data-shell-nav="sections"\] \.shell-nav-link\s*\{[\s\S]*?\n\}/)?.[0] || "";

    assert.match(indexHtml, /data-patch-key="shell-nav-resume-label"/, "Resume top-nav label is patch-addressable");
    assert.match(indexHtml, /data-patch-key="shell-nav-blog-label"/, "Blog top-nav label is patch-addressable");
    assert.match(indexHtml, /data-patch-key="shell-nav-resources-label"/, "Resources top-nav label is patch-addressable");
    assert.match(navRowBlock, /display:\s*flex/i, "top nav uses a compact flex row instead of equal-width cards");
    assert.doesNotMatch(navRowBlock, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/i, "top nav no longer stretches links into a three-column grid");
    assert.match(navLinkBlock, /(?:width|inline-size):\s*fit-content/i, "shell nav links keep content-width sizing");
    assert.match(navLinkBlock, /text-decoration(?:-line)?:\s*underline/i, "shell nav links keep an explicit hyperlink affordance");
    assert.match(responsiveCss, /\.topbar[\s\S]*grid-template-areas:\s*\n\s*"brand brand"\s*\n\s*"nav language"/i, "mobile topbar places nav and language control on the same row");
    assert.match(responsiveCss, /\.control-cluster[\s\S]*grid-area:\s*language/i, "mobile language control occupies the language grid area");
    assert.match(responsiveCss, /\.shell-nav[\s\S]*grid-area:\s*nav/i, "mobile nav occupies the nav grid area");
    assert.match(responsiveCss, /\[data-shell-nav="sections"\] \.shell-nav-link[\s\S]*min-height:\s*calc\(var\(--touch-target-min\)\s*\+\s*8px\)/i, "mobile nav links still exceed the baseline touch target");
    assert.doesNotMatch(responsiveCss, /\.language-status,\s*\n\s*\.language-popup,\s*\n\s*\.shell-nav[\s\S]*width:\s*100%/i, "mobile translating text is not forced into the globe-sized cluster");
    assert.match(responsiveCss, /\.language-popup[\s\S]*right:\s*0[\s\S]*left:\s*auto[\s\S]*max-width:\s*calc\(100vw\s*-\s*32px\)/i, "mobile translating popup stays inside the viewport");
    assert.match(responsiveCss, /\.language-menu[\s\S]*right:\s*0[\s\S]*left:\s*auto[\s\S]*max-width:\s*calc\(100vw\s*-\s*32px\)/i, "mobile language menu opens inward from the right edge");
    assert.match(responsiveCss, /\.language-globe[\s\S]*width:\s*calc\(var\(--touch-target-min\)\s*\+\s*8px\)[\s\S]*height:\s*calc\(var\(--touch-target-min\)\s*\+\s*8px\)/i, "mobile language globe is square and matches the nav link height");
}

{
    installBrowserGlobals({ reducedMotion: false, hash: "#/resume", scrollY: 240 });

    const currentViewRef = { value: "resume" };
    const state = {
        currentLang: "it",
        isPatching: false,
        isRouteTransitioning: false,
        patchGranularity: "word",
        patchDirection: "reverse",
        patchSpeedPreset: "3",
        languagePatchState: "idle"
    };
    const navElements = new Map([
        ['[data-patch-key="shell-nav-resume-label"]', createElement({ tagName: "A", textContent: "Curriculum", attributes: { href: "#/resume" } })],
        ['[data-patch-key="shell-nav-blog-label"]', createElement({ tagName: "A", textContent: "Blog", attributes: { href: "#/blog" } })],
        ['[data-patch-key="shell-nav-resources-label"]', createElement({ tagName: "A", textContent: "Risorse", attributes: { href: "#/resources" } })]
    ]);
    const { renderer } = renderView(source, "it", "resume");
    const triggerElement = navElements.get('[data-patch-key="shell-nav-resume-label"]');

    const patchEngine = createPatchEngine({
        app: { querySelector: () => null, setAttribute() {} },
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
        getTimingConfig: () => ({ stepDelay: 5, holdDelay: 5, groupStagger: 0, groupPause: 0 }),
        buildRenderableFields: renderer.buildRenderableFields,
        buildChromeFields: buildShellNavigationFields,
        queryPatchElement: (key) => navElements.get(`[data-patch-key="${key}"]`) || null,
        renderApp: () => {},
        renderContentError: () => {},
        applyUiText: (data) => {
            document.documentElement.lang = data.htmlLang;
        },
        setGroupPatchState: () => {},
        setLanguagePatchState: () => {},
        isReducedMotion: () => false
    });

    const patchPromise = patchEngine.runPatch("en", { triggerElement });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(navElements.get('[data-patch-key="shell-nav-resume-label"]').innerHTML, /patch-fragment--/, "top-nav labels enter the visible patch lifecycle instead of snapping immediately");
    await patchPromise;

    assert.equal(navElements.get('[data-patch-key="shell-nav-resume-label"]').textContent, "Resume", "Resume nav label settles to the target language after patching");
    assert.equal(navElements.get('[data-patch-key="shell-nav-blog-label"]').textContent, "Blog", "Blog nav label stays coherent after patching");
    assert.equal(navElements.get('[data-patch-key="shell-nav-resources-label"]').textContent, "Resources", "Resources nav label settles to the target language after patching");
    assert.equal(window.location.hash, "#/resume", "manual language patch preserves the current route while patching top-nav labels");
}

console.log("SBR-024 public shell compact nav and chooser cleanup assertions passed");
