import assert from "node:assert/strict";
import fs from "node:fs";
import { applyLanguagePatchState, syncShellNavigation } from "../app/controls.js";
import { createPublishedSource, PUBLIC_CONTACT_EMAIL } from "../app/content-loader.js";
import { createIntroController } from "../app/intro.js";
import { createRenderer } from "../app/render.js";

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
        dataset: { ...(options.dataset || {}) },
        classList: createClassList(options.classNames || []),
        textContent: options.textContent || "",
        innerHTML: options.innerHTML || "",
        hidden: Boolean(options.hidden),
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
        }
    };

    Object.entries(options.attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));

    return element;
}

function createIntroChoiceLink(sectionChoice, label) {
    const strong = createElement({ textContent: label });

    return {
        dataset: { sectionChoice },
        querySelector(selector) {
            return selector === "strong" ? strong : null;
        },
        labelElement: strong
    };
}

const source = readSource();
const indexHtml = fs.readFileSync("index.html", "utf8");
const scriptSource = fs.readFileSync("script.js", "utf8");
const controlsSource = fs.readFileSync("app/controls.js", "utf8");
const introSource = fs.readFileSync("app/intro.js", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const introCss = fs.readFileSync("styles/intro.css", "utf8");
const responsiveCss = fs.readFileSync("styles/responsive.css", "utf8");

{
    assert.match(indexHtml, /data-shell-nav="sections"/, "index.html exposes a dedicated section nav row");
    assert.match(indexHtml, /data-shell-nav="sections"[\s\S]*href="#\/resume"[\s\S]*href="#\/blog"[\s\S]*href="#\/resources"/, "section nav contains Resume, Blog and Resources routes in order");
    assert.doesNotMatch(indexHtml, /data-nav-toggle|aria-controls="[^"]*nav|hamburger|drawer-toggle/i, "public shell renders no hamburger or drawer toggle for section nav");
    assert.match(indexHtml, /data-language-popup/, "index.html includes a dedicated temporary language popup element");
    assert.match(indexHtml, /window\.location\.hash[\s\S]*data-current-section/, "index bootstraps the visible current section from the hash before shell styling applies");
}

{
    const navLinks = [
        createElement({ dataset: { section: "resume" } }),
        createElement({ dataset: { section: "blog" } }),
        createElement({ dataset: { section: "resources" } })
    ];

    syncShellNavigation({ navLinks }, source.languages.en, "blog");
    assert.deepEqual(navLinks.map((link) => link.textContent), ["Resume", "Blog", "Resources"], "EN nav labels match recruiter-facing section names");
    assert.equal(navLinks[1].getAttribute("aria-current"), "page", "current EN route is marked active");
    assert.equal(navLinks[0].getAttribute("aria-current"), null, "non-current EN routes are not active");

    syncShellNavigation({ navLinks }, source.languages.it, "resume");
    assert.deepEqual(navLinks.map((link) => link.textContent), ["Curriculum", "Blog", "Risorse"], "IT nav labels translate with the active language");
    assert.equal(navLinks[0].getAttribute("aria-current"), "page", "current IT route is marked active");
    assert.equal(navLinks[0].dataset.sectionAccent, "resume", "active route keeps its section accent");
}

{
    const state = { currentLang: "it", languagePatchState: "idle" };
    const refs = {
        languageGlobe: createElement(),
        languageGlobeCurrent: createElement(),
        languageStatus: createElement(),
        languagePopup: createElement({ attributes: { "data-language-popup": "true", hidden: "hidden", "aria-hidden": "true" } }),
        statusChip: createElement(),
        statusRight: createElement(),
        patchScope: createElement()
    };

    applyLanguagePatchState(refs, state, "idle", { toLang: "it" });
        assert.equal(refs.languageGlobeCurrent.textContent, "", "idle globe remains icon-only without a visible language abbreviation");
    assert.equal(refs.languagePopup.hidden, true, "language popup stays hidden while idle");
        assert.doesNotMatch(refs.statusChip.textContent, /site\.(?:it|en|fr)|idle/i, "legacy visible status-chip copy is gone in idle");

    applyLanguagePatchState(refs, state, "patching", { fromLang: "IT", toLang: "EN" });
    assert.equal(refs.languagePopup.hidden, false, "language popup becomes visible while patching");
    assert.equal(refs.languagePopup.textContent, "translating IT → EN", "language popup uses the exact source-to-target copy");

    state.currentLang = "en";
    applyLanguagePatchState(refs, state, "complete", { fromLang: "IT", toLang: "EN" });
    assert.equal(refs.languagePopup.hidden, true, "language popup hides again after completion");
}

{
    const { html: itHomeHtml } = renderView(source, "it", "home");
    const { html: enHomeHtml } = renderView(source, "en", "home");

    assert.doesNotMatch(itHomeHtml + enHomeHtml, /chooser-card|chooser-question|data-section-choice="resume"|data-section-choice="blog"|data-section-choice="resources"/, "Home app mount no longer renders a duplicate chooser/dashboard surface");
    assert.doesNotMatch(indexHtml + introSource, /intro-identity/, "site intro no longer renders a separate catchphrase line between hello and the links");
}

{
    const hint = createElement();
    const introChoices = [
        createIntroChoiceLink("resume", "Resume"),
        createIntroChoiceLink("blog", "Blog"),
        createIntroChoiceLink("resources", "Resources")
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

    intro.updateUi({
        introHint: source.languages.it.ui.introHint,
        sectionChoices: source.languages.it.sectionChooser.choices
    });
    assert.equal(hint.textContent, "Cosa ti porta qui?", "intro controller syncs the approved IT Home question");
    assert.deepEqual(introChoices.map((choice) => choice.labelElement.textContent), ["Curriculum", "Blog", "Risorse"], "intro controller syncs visible IT Home section labels");

    intro.updateUi({
        introHint: source.languages.en.ui.introHint,
        sectionChoices: source.languages.en.sectionChooser.choices
    });
    assert.equal(hint.textContent, "What brings you here?", "intro controller syncs the approved EN Home question");
    assert.deepEqual(introChoices.map((choice) => choice.labelElement.textContent), ["Resume", "Blog", "Resources"], "intro controller syncs visible EN Home section labels");
}

{
    assert.match(shellCss, /body\[data-current-section="home"\] \.shell\s*\{[\s\S]*display:\s*none/i, "Home hides the page shell so the intro hub is the only visible surface");
    assert.match(shellCss, /\[data-shell-nav="sections"\][\s\S]*aria-current="page"[\s\S]*line-strong/i, "current nav link styling uses a strong line treatment");
    assert.match(shellCss, /\[data-shell-nav="sections"\][\s\S]*section-accent|section-resume-500|section-blog-500|section-resources-500/i, "current nav styling maps to section accent tokens");
    assert.match(shellCss, /\.language-status[\s\S]*clip: rect\(0 0 0 0\)|\.language-status[\s\S]*width: 1px[\s\S]*height: 1px/s, "live language status is visually hidden outside the temporary popup");
    assert.match(shellCss, /\[data-language-popup\][\s\S]*position: absolute|\.language-popup[\s\S]*position: absolute/s, "language popup is positioned as a nearby transient control-surface element");
}

{
    assert.match(responsiveCss, /\.shell-nav-link[\s\S]*min-height:\s*calc\(var\(--touch-target-min\)\s*\+\s*8px\)/, "mobile nav links use a min-height greater than the baseline touch-target token");
    assert.doesNotMatch(shellCss + responsiveCss, /\[data-shell-nav="sections"\][\s\S]*display:\s*none/i, "section nav is not hidden at mobile breakpoints");
}

{
    const manifestFailureBranch = scriptSource.match(/if \(!loadResult\.ok[\s\S]*?\n\s*return;\n\s*\}/)?.[0] || "";
    assert.ok(manifestFailureBranch, "public boot keeps a manifest-load failure branch");
    assert.match(manifestFailureBranch, /syncCurrentSection\("content-error"\)/, "manifest failure switches the shell out of the hidden Home state before rendering the public error");
    assert.match(manifestFailureBranch, /showContentErrorState/, "manifest failure still renders the public error state");
    assert.ok(indexHtml.includes("sbar.si"), "brand remains present in the public shell source");
    assert.ok(indexHtml.includes("data-shell-nav=\"sections\""), "section nav remains present in the public shell source");
    assert.ok(indexHtml.includes("data-language-globe"), "language control remains present in the public shell source");
    assert.doesNotMatch(indexHtml, /<footer class="statusbar"|\[F1\] resume \[F2\] blog \[F3\] resources|translation::ready \/ reverse \/ word \/ slow/, "visible footer/status-strip markup is absent from the public shell source");
    assert.ok(PUBLIC_CONTACT_EMAIL === "alessandro@sbar.si", "public contact email constant uses the sbar.si mailbox");
}

console.log("SBR-017 public shell visible nav and language chrome assertions passed");
