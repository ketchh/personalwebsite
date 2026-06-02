import assert from "node:assert/strict";
import fs from "node:fs";
import { createControlsController, applyLanguagePatchState } from "../app/controls.js";
import { createPublishedSource, PUBLIC_CONTACT_EMAIL } from "../app/content-loader.js";
import { createPatchEngine } from "../app/patch-engine.js";
import { createRenderer } from "../app/render.js";

const PACKAGE_ARTIFACTS = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "deno.json"];
const REQUIRED_TOKENS = [
    "--section-home-500",
    "--section-resume-500",
    "--section-blog-500",
    "--section-resources-500",
    "--home-frame-max",
    "--radius-none",
    "--radius-control",
    "--radius-card",
    "--motion-patch-expressive"
];

function readSource() {
    return createPublishedSource(JSON.parse(fs.readFileSync("data/published.json", "utf8")));
}

function renderView(source, languageKey, view) {
    const app = { innerHTML: "" };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => view
    });

    renderer.renderApp(source.languages[languageKey]);

    return { html: app.innerHTML, renderer };
}

function getCssVariable(css, name) {
    const match = css.match(new RegExp(`${name.replaceAll("-", "\\-")}\\s*:\\s*([^;]+);`));
    return match ? match[1].trim() : "";
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
        tagName: options.tagName || "BUTTON",
        dataset: { ...(options.dataset || {}) },
        classList: createClassList(options.classNames || []),
        textContent: options.textContent || "",
        innerHTML: options.innerHTML || "",
        focused: false,
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

function installBrowserGlobals({ reducedMotion = false, hash = "#/home", scrollY = 0, activeElement = null } = {}) {
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
        validateRenderableTransition(fromFields, toFields) {
            return fromFields.length === toFields.length && fromFields.every((field, index) => field.key === toFields[index].key);
        }
    };
}

const source = readSource();
const indexHtml = fs.readFileSync("index.html", "utf8");
const scriptSource = fs.readFileSync("script.js", "utf8");
const introSource = fs.readFileSync("app/intro.js", "utf8");
const baseCss = fs.readFileSync("styles/base.css", "utf8");
const introCss = fs.readFileSync("styles/intro.css", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const patchCss = fs.readFileSync("styles/patch.css", "utf8");
const responsiveCss = fs.readFileSync("styles/responsive.css", "utf8");
const allPublicCss = [baseCss, introCss, shellCss, patchCss, responsiveCss].join("\n");
const adminCss = fs.readFileSync("admin/public/admin.css", "utf8");

{
    for (const token of REQUIRED_TOKENS) {
        assert.match(baseCss, new RegExp(`${token.replaceAll("-", "\\-")}\\s*:`), `${token} is exposed in public tokens`);
    }

    const home = getCssVariable(baseCss, "--section-home-500");
    const resume = getCssVariable(baseCss, "--section-resume-500");
    const blog = getCssVariable(baseCss, "--section-blog-500");
    const resources = getCssVariable(baseCss, "--section-resources-500");

    assert.ok(home, "home section token has a value");
    assert.ok(resume && blog && resources, "section color tokens have values");
    assert.equal(new Set([resume, blog, resources]).size, 3, "Resume, Blog and Resources section colors are distinct");
    assert.ok(["var(--text)", "var(--text-50)", "#f4fff3", "#F4FFF3", "#fff", "#ffffff", "white"].includes(home), "Home section token is monochrome/text-colored");
}

{
    assert.doesNotMatch(indexHtml, /id="intro-arrow"|class="intro-arrow"/, "old intro arrow is not rendered in index.html");
    assert.doesNotMatch(indexHtml, /Scroll to choices|scroll down|scroll to choices/i, "index.html has no down-scroll cue text");
    assert.match(indexHtml, /data-section-accent="home"/, "intro frame exposes Home section accent");
    assert.match(indexHtml, /data-section-choice="resume"[\s\S]*data-section-choice="blog"[\s\S]*data-section-choice="resources"/, "intro choices expose deterministic section-choice attributes");
    assert.match(introCss, /home-frame-max|100svh/, "intro CSS constrains the Home frame to the viewport");
    assert.doesNotMatch(introSource + scriptSource, /scrollToShellIfNeeded|scrollIntoView\s*\(/, "public route selection code contains no forced-scroll helper");
}

{
    const manifestFailureBranch = scriptSource.match(/if \(!loadResult\.ok[\s\S]*?\n\s*return;\n\s*\}/)?.[0] || "";
    assert.ok(manifestFailureBranch, "public boot has a manifest-load failure branch");
    assert.match(manifestFailureBranch, /data-current-section|syncCurrentSection\([^)]|setAttribute\("data-current-section"/, "manifest failure switches the shell away from hidden Home before rendering the email fallback");
    assert.doesNotMatch(manifestFailureBranch, /renderer\.renderContentError[\s\S]*return;\s*\}/, "manifest failure must not render the error card while body remains data-current-section=home");
}

{
    const { html: homeHtml } = renderView(source, "it", "home");
    assert.match(homeHtml, /data-current-section="home"/, "Home route exposes active section");
    assert.match(homeHtml, /data-section-accent="home"/, "Home route exposes monochrome section accent");
    assert.doesNotMatch(homeHtml, /chooser-card|data-section-choice="resume"|data-section-choice="blog"|data-section-choice="resources"/, "Home app mount no longer renders a duplicate chooser/dashboard surface");
    assert.doesNotMatch(homeHtml, /data-patch-group="view-|hero-card|facts-card|entry-card|panel-\d+-entry-0-heading|data-page-rail-frame/, "Home route renders no downstream section content or page frame");

    const enHomeHtml = renderView(source, "en", "home").html;
    assert.doesNotMatch(enHomeHtml, /chooser-card|data-section-choice="resume"|data-section-choice="blog"|data-section-choice="resources"/, "EN Home app mount also stays free of duplicate chooser/dashboard content");
}

{
    for (const view of ["resume", "blog", "resources"]) {
        const { html } = renderView(source, "it", view);
        assert.match(html, new RegExp(`data-current-section="${view}"`), `${view} route exposes active section`);
        assert.match(html, new RegExp(`data-section-accent="${view}"`), `${view} route exposes section accent`);
        assert.match(shellCss, new RegExp(`data-current-section="${view}"[\\s\\S]*--section-accent:\\s*var\\(--section-${view}-500\\)`), `${view} route maps to its section token`);
    }

    const resumeHtml = renderView(source, "it", "resume").html;
    assert.match(resumeHtml, /mailto:alessandro@sbar\.si/, "Resume keeps visible email mailto action");
    assert.match(resumeHtml, /data-action="email"/, "Resume email action keeps deterministic marker");
    assert.match(shellCss, /\.hero-action\.is-primary[\s\S]*--section-resume-500/, "primary Resume email action uses the Resume section color");
    assert.match(resumeHtml, /PDF|LinkedIn|GitHub/i, "Resume secondary links remain present");
}

{
    assert.match(shellCss, /content-error-card[\s\S]*(?:--danger|--danger-500)/, "content unavailable state keeps danger/error styling");
    assert.match(patchCss, /patch-fragment--add[\s\S]*(?:--success|--add|--success-500)/, "patch add/complete semantics stay success/add colored");
    assert.match(patchCss, /patch-fragment--remove[\s\S]*(?:--danger|--remove|--danger-500)/, "patch remove/error semantics stay danger/remove colored");
    assert.doesNotMatch(adminCss, /section-resume-500|section-blog-500|section-resources-500/, "admin/security state CSS is not remapped to public section colors");
}

{
    for (const selector of [".shell", ".choice-card", ".card", ".language-globe", ".patch-toolbar"]) {
        assert.match(allPublicCss, new RegExp(`${selector.replaceAll(".", "\\.")}[\\s\\S]*border-radius:\\s*var\\(--radius-(?:none|control|card)\\)`), `${selector} uses squared TUI radius tokens`);
    }
    assert.doesNotMatch(allPublicCss, /border-radius:\s*999px/, "public primary surfaces do not introduce pill-shaped radii");
}

{
    assert.match(indexHtml, /data-language-globe/, "index.html renders a global language globe control");
    assert.match(indexHtml, /data-language-menu/, "index.html renders a menu for choosing among available languages");
    assert.doesNotMatch(indexHtml, /<nav class="lang-switch"/, "old two-button language nav is removed");
    assert.match(indexHtml, /data-lang="fr"/, "language menu includes French as a selectable option");
    assert.doesNotMatch(indexHtml, /<footer class="statusbar"|\[F1\] resume \[F2\] blog \[F3\] resources|translation::ready \/ reverse \/ word \/ slow/, "legacy footer/status strip is absent from the public shell source");
    assert.doesNotMatch(indexHtml, /id="language-globe-current"/, "language globe no longer shows the current language abbreviation inside the button");
    assert.match(indexHtml, /language-globe-icon[\s\S]*<svg/, "language globe uses an icon-only globe affordance");
    assert.match(shellCss, /\.language-globe[\s\S]*min-(?:width|inline-size):\s*var\(--touch-target-min\)[\s\S]*min-(?:height|block-size):\s*var\(--touch-target-min\)/, "language globe hit target uses touch-target-min");
    assert.match(shellCss, /\.topbar\s*\{[\s\S]*z-index:\s*(?:[3-9]\d|[1-9]\d{2,})/, "topbar stacks above page content so the language menu stays clickable");

    const languageGlobe = createElement({ dataset: { languageGlobe: "" } });
    const languageGlobeCurrent = createElement({ tagName: "SPAN", textContent: "IT" });
    const languageMenu = createElement({ tagName: "DIV" });
    languageMenu.hidden = true;
    const languageMenuButtons = [
        createElement({ dataset: { lang: "it" } }),
        createElement({ dataset: { lang: "en" } }),
        createElement({ dataset: { lang: "fr" } })
    ];
    const languageStatus = createElement();
    const patchScope = createElement({ tagName: "DIV" });
    const state = { currentLang: "it", isPatching: false, patchGranularity: "word", patchDirection: "reverse", patchSpeedPreset: "3" };
    const selections = [];
    const controls = createControlsController({
        refs: {
            patchSelectorLabel: null,
            patchDirectionLabel: null,
            patchSpeedLabel: null,
            patchSpeedSlider: null,
            patchSpeedValue: null,
            statusRight: createElement(),
            langButtons: [],
            languageGlobe,
            languageGlobeCurrent,
            languageMenu,
            languageMenuButtons,
            patchGranularityButtons: [],
            patchDirectionButtons: []
        },
        state,
        source,
        runtimeConfig: createRuntimeConfig()
    });

    controls.syncUi(source.languages.it);
    assert.equal(languageGlobeCurrent.textContent, "", "language globe keeps the visible button icon-only");
    assert.match(languageGlobe.getAttribute("aria-label"), /Current language: Italiano|IT/i, "language globe accessible label names the current language");

    controls.bind({
        onLanguageChange(nextLang, options) {
            selections.push({ nextLang, triggerElement: options.triggerElement });
        }
    });
    languageGlobe.click();
    assert.equal(languageMenu.hidden, false, "clicking the language globe opens the language menu");
    assert.deepEqual(selections.map((entry) => entry.nextLang), [], "opening the language menu does not select a language immediately");
    languageMenuButtons[1].click();
    assert.deepEqual(selections.map((entry) => entry.nextLang), ["en"], "clicking a language menu option selects that language");
    assert.equal(selections[0].triggerElement, languageMenuButtons[1], "language option is forwarded as the patch trigger element");

    state.currentLang = "en";
    controls.syncUi(source.languages.en);
    assert.equal(languageGlobeCurrent.textContent, "", "language globe remains icon-only after language changes");
    assert.match(languageGlobe.getAttribute("aria-label"), /Current language: English|EN/i, "language globe label updates to the active language");

    applyLanguagePatchState({ languageGlobe, languageGlobeCurrent, languageMenu, languageMenuButtons, languageStatus, patchScope }, state, "patching", { fromLang: "en", toLang: "it" });
    assert.equal(languageGlobe.getAttribute("data-patch-state"), "patching", "language globe exposes patching state");
    assert.equal(languageMenu.hidden, true, "language menu closes while patching");
    assert.equal(patchScope.getAttribute("data-patch-scope"), "page", "patch scope marks page-level translation");
    assert.equal(patchScope.getAttribute("data-patch-state"), "patching", "patch scope exposes patching state");
}

{
    assert.match(patchCss + shellCss, /motion-patch-expressive/, "public CSS uses motion-patch-expressive for the signature language motion");

    const state = { currentLang: "it", isPatching: false, patchGranularity: "word", patchDirection: "reverse", patchSpeedPreset: "3" };
    const languageGlobe = createElement({ dataset: { languageGlobe: "" } });
    const languageGlobeCurrent = createElement({ tagName: "SPAN", textContent: "IT" });
    const languageStatus = createElement();
    const patchScope = createElement({ tagName: "DIV" });
    installBrowserGlobals({ reducedMotion: true, hash: "#/resources", scrollY: 400, activeElement: languageGlobe });

    const app = { innerHTML: "", querySelector: () => null };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => "resources"
    });
    renderer.renderApp(source.languages.it);

    const patchEngine = createPatchEngine({
        app,
        state,
        getLanguageEntry: (requestedKey) => ({ key: requestedKey, data: source.languages[requestedKey] }),
        validateLanguageShape: () => true,
        validateRenderableTransition: createRuntimeConfig().validateRenderableTransition,
        warnMissingPatchElement: () => {},
        statusChip: createElement(),
        statusRight: createElement(),
        getGranularityLabels: () => ({ short: "word", long: "word by word" }),
        getDirectionLabels: () => ({ short: "reverse", long: "from end to start" }),
        getSpeedPreset: () => ({ short: "slow", long: "slower", multiplier: 1 }),
        getTimingConfig: () => {
            throw new Error("reduced-motion patch should not request expressive token timing");
        },
        buildRenderableFields: renderer.buildRenderableFields,
        renderApp: renderer.renderApp,
        applyUiText: (data) => {
            document.documentElement.lang = data.htmlLang;
            languageGlobeCurrent.textContent = data.htmlLang.toUpperCase();
        },
        renderContentError: renderer.renderContentError,
        setGroupPatchState: renderer.setGroupPatchState,
        setLanguagePatchState: (phase, details) => applyLanguagePatchState({ languageGlobe, languageGlobeCurrent, languageStatus, patchScope }, state, phase, details),
        isReducedMotion: () => true
    });

    const result = await patchEngine.runPatch("en", { triggerElement: languageGlobe });
    assert.equal(result.started, true, "reduced-motion language globe patch starts");
    assert.equal(result.reducedMotion, true, "reduced-motion path direct-renders");
    assert.equal(document.documentElement.lang, "en", "language patch updates the document language");
    assert.equal(languageGlobeCurrent.textContent, "", "language globe remains icon-only after reduced-motion language changes");
    assert.match(languageStatus.textContent, /en.*(complete|idle)|en.*ready/i, "language status announces reduced-motion completion");
    assert.doesNotMatch(app.innerHTML, /patch-fragment--remove|patch-fragment--add/, "reduced-motion render does not emit token fragments");
    assert.equal(window.scrollY, 400, "reduced-motion language switch preserves scroll context");
}

for (const packageArtifact of PACKAGE_ARTIFACTS) {
    assert.ok(!fs.existsSync(packageArtifact), `${packageArtifact} was not introduced`);
}

console.log("SBR-010 public TUI shell visual foundation assertions passed");
