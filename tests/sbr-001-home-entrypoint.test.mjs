import assert from "node:assert/strict";
import fs from "node:fs";
import { createPublishedSource } from "../app/content-loader.js";
import { createRenderer } from "../app/render.js";

function loadPortfolioContent() {
    return createPublishedSource(JSON.parse(fs.readFileSync("data/published.json", "utf8")));
}

function renderView(content, languageKey, view) {
    const app = { innerHTML: "" };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => view
    });

    renderer.renderApp(content.languages[languageKey]);

    return { html: app.innerHTML, renderer };
}

function extractIntroLinks(indexHtml) {
    const choicesMatch = indexHtml.match(/<div class="intro-choices"[\s\S]*?<\/div>/);
    assert.ok(choicesMatch, "intro choices container exists");

    return [...choicesMatch[0].matchAll(/<a\s+href="([^"]+)"[\s\S]*?<strong>([^<]+)<\/strong>/g)].map((match) => ({
        href: match[1],
        label: match[2]
    }));
}

function extractShellChoices(html) {
    return [...html.matchAll(/<a class="choice-card([^"]*)" href="([^"]+)"([^>]*)>[\s\S]*?<strong class="choice-title"[^>]*>([^<]+)<\/strong>/g)].map((match) => ({
        classes: match[1],
        href: match[2],
        attributes: match[3],
        label: match[4]
    }));
}

const content = loadPortfolioContent();
const indexHtml = fs.readFileSync("index.html", "utf8");
const introCss = fs.readFileSync("styles/intro.css", "utf8");
const responsiveCss = fs.readFileSync("styles/responsive.css", "utf8");

{
    const { html } = renderView(content, "it", "home");

    assert.match(html, /data-current-section="home"/, "home route still exposes the active section marker");
    assert.doesNotMatch(html, /chooser-card|data-patch-group="chooser"|data-section-choice="resume"/, "home app mount no longer renders a duplicate chooser/dashboard surface");
    assert.doesNotMatch(html, /data-patch-group="view-blog"/, "home does not render the Blog section header");
    assert.doesNotMatch(html, /hero-card|facts-card|view-card|data-page-rail-frame/, "home app mount does not render inner-page frame content");
    assert.doesNotMatch(html, /Nessun post pubblicato per ora|No posts published yet/, "home does not render Blog placeholder entries");
    assert.doesNotMatch(html, /panel-\d+-entry-0-heading|panel-\d+-entry-0-copy/, "home does not render any panel entry fields");
}

{
    const prefixIndex = indexHtml.indexOf("id=\"site-intro-prefix\"");
    const hintIndex = indexHtml.indexOf("id=\"intro-hint\"");
    const choicesIndex = indexHtml.indexOf("id=\"intro-choices\"");
    const arrowIndex = indexHtml.indexOf("id=\"intro-arrow\"");

    assert.ok(prefixIndex !== -1, "intro hello identity line exists");
    assert.ok(hintIndex !== -1, "intro question exists");
    assert.ok(choicesIndex !== -1, "intro choices exist");
    assert.equal(arrowIndex, -1, "intro no longer renders a down-scroll arrow");
    assert.ok(prefixIndex < hintIndex, "hello line appears before the Home question");
    assert.ok(hintIndex < choicesIndex, "Home question appears before section links");
    assert.match(indexHtml, /Cosa ti porta qui\?/i, "intro uses the approved Italian first-paint Home question");
    assert.doesNotMatch(indexHtml, /intro-identity|codice chiaro, sistemi complessi|clear code, complex systems/i, "intro no longer renders a separate catchphrase line");

    assert.deepEqual(extractIntroLinks(indexHtml), [
        { href: "#/resume", label: "Curriculum" },
        { href: "#/blog", label: "Blog" },
        { href: "#/resources", label: "Risorse" }
    ]);
}

{
    const itHomeHtml = renderView(content, "it", "home").html;
    const enHomeHtml = renderView(content, "en", "home").html;

    assert.doesNotMatch(itHomeHtml + enHomeHtml, /chooser-card|data-section-choice="resume"|data-section-choice="blog"|data-section-choice="resources"/, "home app mount no longer duplicates the intro chooser in either language");
}

{
    const itHome = renderView(content, "it", "home");
    const enHome = renderView(content, "en", "home");
    const itFields = itHome.renderer.buildRenderableFields(content.languages.it);
    const enFields = enHome.renderer.buildRenderableFields(content.languages.en);

    assert.deepEqual(itFields.map((field) => field.key), enFields.map((field) => field.key));
    assert.deepEqual(itFields, [], "home renderer exposes no in-app chooser patch fields");
    assert.deepEqual(enFields, [], "home renderer exposes no in-app chooser patch fields in EN either");
}

{
    assert.match(responsiveCss, /prefers-reduced-motion:\s*reduce/, "reduced-motion media query exists");
    assert.match(introCss + responsiveCss, /prefers-reduced-motion[\s\S]*\.intro-choices[\s\S]*pointer-events:\s*auto/, "reduced-motion path enables section choices immediately");
    assert.doesNotMatch(indexHtml, /intro-arrow|Scroll to choices/i, "home source has no down-scroll arrow cue");
    assert.match(introCss, /\.intro-choices a\s*\{[\s\S]*min-height:\s*(?:[4-9]\d|\d{3,})px/, "intro choice hit target is at least 44px tall");
}

console.log("SBR-001 home entrypoint assertions passed");
