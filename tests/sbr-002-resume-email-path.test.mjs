import assert from "node:assert/strict";
import fs from "node:fs";
import { createPublishedSource } from "../app/content-loader.js";
import { createRenderer } from "../app/render.js";

const EMAIL = "alessandro@sbar.si";

function loadPortfolioContent() {
    return createPublishedSource(JSON.parse(fs.readFileSync("data/published.json", "utf8")));
}

function renderResume(content, languageKey) {
    const app = { innerHTML: "" };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => "resume"
    });

    renderer.renderApp(content.languages[languageKey]);

    return { html: app.innerHTML, renderer };
}

function extractSections(html) {
    return [...html.matchAll(/<section class="card ([^"]+)"/g)].map((match) => match[1]);
}

function extractHeroActions(html) {
    const heroMatch = html.match(/<section class="card hero-card"[\s\S]*?<div class="hero-actions">(?<actions>[\s\S]*?)<\/div>\s*<\/section>/);
    assert.ok(heroMatch, "hero actions container exists");

    return [...heroMatch.groups.actions.matchAll(/<a class="([^"]*)" data-patch-key="([^"]*)"([^>]*)>([^<]*)<\/a>/g)].map((match) => ({
        className: match[1],
        patchKey: match[2],
        attributes: match[3],
        text: match[4]
    }));
}

function getHref(action) {
    const hrefMatch = action.attributes.match(/href="([^"]*)"/);
    return hrefMatch ? hrefMatch[1] : "";
}

function getHeroCopy(html) {
    const title = html.match(/data-patch-key="hero-title">([^<]*)<\/p>/)?.[1] || "";
    const summary = html.match(/data-patch-key="hero-summary">([^<]*)<\/p>/)?.[1] || "";
    return `${title} ${summary}`;
}

function assertEmailFirstHero(html) {
    const actions = extractHeroActions(html);
    assert.equal(actions.length, 4, "resume hero keeps exactly four actions");

    const [email, pdf, linkedIn, gitHub] = actions;
    assert.equal(getHref(email), `mailto:${EMAIL}`);
    assert.equal(email.text, EMAIL);
    assert.match(email.className, /(?:^|\s)is-primary(?:\s|$)/, "email action has primary class");
    assert.match(email.attributes, /data-action="email"/, "email action has deterministic data-action");

    assert.match(getHref(pdf), /alessandro-sbarsi-resume\.pdf$/, "PDF action remains after email");
    assert.match(pdf.text, /pdf|resume/i, "PDF action remains labelled");
    assert.match(getHref(linkedIn), /linkedin\.com\/in\/alessandro-sbarsi\/?$/, "LinkedIn action remains after PDF");
    assert.match(getHref(gitHub), /github\.com\/ketchh\/?$/, "GitHub action remains after LinkedIn");

    for (const action of [pdf, linkedIn, gitHub]) {
        assert.doesNotMatch(action.className, /(?:^|\s)is-primary(?:\s|$)/, "secondary actions are not primary");
        assert.doesNotMatch(action.attributes, /data-action="email"/, "secondary actions do not use email action marker");
    }
}

const content = loadPortfolioContent();
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const responsiveCss = fs.readFileSync("styles/responsive.css", "utf8");
const resumePdfHtml = fs.readFileSync("resume-pdf.html", "utf8");

for (const languageKey of Object.keys(content.languages)) {
    const { html } = renderResume(content, languageKey);
    const sections = extractSections(html);

    assert.match(sections[0], /hero-card/, `${languageKey}: hero card renders first without a prepended chooser`);
    assert.doesNotMatch(html, /chooser-card is-compact/, `${languageKey}: Resume route no longer prepends the compact chooser`);

    const heroCopy = getHeroCopy(html);
    assert.match(heroCopy, /codice chiaro|clear code|code clair/i, `${languageKey}: hero communicates clear code`);
    assert.match(heroCopy, /sistemi complessi|complex systems|systèmes complexes|performance/i, `${languageKey}: hero communicates systems/performance`);
    assert.match(heroCopy, /conoscenza|knowledge|connaissance|open|ouverte/i, `${languageKey}: hero communicates open knowledge`);

    assertEmailFirstHero(html);

    assert.match(html, /data-patch-key="panel-\d+-contact-0-label">(?:Email|Email)<\/span>\s*<a class="contact-link" data-patch-key="panel-\d+-contact-0-value" href="mailto:alessandro@sbar\.si">alessandro@sbar\.si<\/a>/, `${languageKey}: contacts panel exposes copyable email row`);

    const summaryIndex = html.indexOf('data-patch-key="hero-summary"');
    const skillsIndex = html.search(/data-patch-key="panel-\d+-title">(?:Core skills|Main skills|Competenze principali|Compétences principales)/);
    assert.ok(summaryIndex !== -1, `${languageKey}: hero summary exists`);
    assert.ok(skillsIndex !== -1, `${languageKey}: Core skills panel exists`);
    assert.ok(summaryIndex < skillsIndex, `${languageKey}: personality summary appears before skills panel`);

    assert.match(html, /Odoo/i, `${languageKey}: Odoo remains visible`);
    assert.match(html, /automazione|automation|automating|automat/i, `${languageKey}: automation remains visible`);
    assert.match(html, /Git/i, `${languageKey}: Git remains visible`);
    assert.match(html, /algoritmi|algorithm|algorith/i, `${languageKey}: algorithms remain visible`);
    assert.match(html, /Project Management|Gestion de projet/i, `${languageKey}: project management remains visible`);
}

{
    const it = renderResume(content, "it");
    const itFields = it.renderer.buildRenderableFields(content.languages.it);

    for (const languageKey of Object.keys(content.languages).filter((key) => key !== "it")) {
        const localized = renderResume(content, languageKey);
        const localizedFields = localized.renderer.buildRenderableFields(content.languages[languageKey]);
        assert.deepEqual(itFields.map((field) => field.key), localizedFields.map((field) => field.key), `resume IT/${languageKey.toUpperCase()} patch keys stay aligned`);
    }
}

{
    const itHtml = renderResume(content, "it").html;
    const actions = extractHeroActions(itHtml);
    assert.equal(actions.map(getHref).join("|"), [
        `mailto:${EMAIL}`,
        "./files/alessandro-sbarsi-resume.pdf",
        "https://www.linkedin.com/in/alessandro-sbarsi/",
        "https://github.com/ketchh"
    ].join("|"), "keyboard/tab order follows hero action DOM order");
}

assert.match(shellCss, /\.hero-actions\s*\{[\s\S]*flex-wrap:\s*wrap/, "hero actions wrap instead of overflowing");
assert.match(shellCss, /\.fact-item,\s*\n\.contact-item\s*\{[\s\S]*grid-template-columns:\s*1fr/, "summary facts and contact rows stack vertically instead of rendering side by side");
assert.match(shellCss, /\.hero-action\s*\{[\s\S]*min-height:\s*(?:4[4-9]|[5-9]\d|\d{3,})px/, "hero action target is at least 44px tall");
assert.match(shellCss, /\.hero-action(?:\.is-primary)?[\s\S]*data-action|\.hero-action\.is-primary[\s\S]*var\(--accent/, "primary email action has specific styling");
assert.match(shellCss, /\.hero-action:hover,\s*\n\.hero-action:focus-visible\s*\{[\s\S]*(?:box-shadow|outline:\s*(?!none))/, "hero action focus state is visibly styled");
assert.match(responsiveCss, /hero-actions|hero-action|overflow-x:\s*(?:hidden|clip)/, "responsive CSS accounts for hero actions or document overflow");

{
    const englishResume = content.languages.en.resume || content.languages.en;
    assert.match(resumePdfHtml, /<html lang="en">/, "downloadable resume PDF source is English");
    assert.match(resumePdfHtml, new RegExp(englishResume.hero.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "PDF headline matches the English resume headline");
    assert.match(resumePdfHtml, /I have lived in Milan for most of my life/, "PDF profile uses the English resume summary");
    assert.match(resumePdfHtml, /April 2024 - Present \/ Developer \/ Milan/, "PDF current experience matches the English resume");
    assert.match(resumePdfHtml, /November 2022 - April 2024 \/ Waiter \/ Bartender \/ Milan/, "PDF previous experience matches the English resume");
    assert.match(resumePdfHtml, /Python, JavaScript, SQL\./, "PDF skills match the English resume skills panel");
    assert.match(resumePdfHtml, /French &mdash; Limited working proficiency\./, "PDF languages match the English resume languages panel");
    assert.doesNotMatch(resumePdfHtml, /Onetap|Profilo|Esperienza|Formazione|Competenze principali|Lingue|Fonte/, "PDF source does not keep stale Italian or extra resume content");
}

console.log("SBR-002 resume identity/email path assertions passed");
