import assert from "node:assert/strict";
import fs from "node:fs";
import { createPublishedSource } from "../app/content-loader.js";
import { createRenderer } from "../app/render.js";

function readSource() {
    return createPublishedSource(JSON.parse(fs.readFileSync("data/published.json", "utf8")));
}

function renderView(source, languageKey, view) {
    const app = { innerHTML: "", setAttribute() {} };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => view
    });

    renderer.renderApp(source.languages[languageKey]);

    return { html: app.innerHTML, renderer };
}

const source = readSource();
const indexHtml = fs.readFileSync("index.html", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const scriptSource = fs.readFileSync("script.js", "utf8");

{
    const { html: homeHtml } = renderView(source, "it", "home");
    const { html: resumeHtml } = renderView(source, "it", "resume");

    assert.match(homeHtml, /data-current-section="home"/, "Home route still exposes the active home marker");
    assert.doesNotMatch(homeHtml, /data-page-rail-frame|hero-card|view-card|brand-title|language-globe/, "Home app mount stays intro-only and does not render page chrome or page content");
    assert.match(resumeHtml, /data-page-rail-frame/, "non-Home route rendering still keeps the page frame");
}

{
    const homeShellBlock = shellCss.match(/body\[data-current-section="home"\] \.shell\s*\{[\s\S]*?\n\}/)?.[0] || "";

    assert.match(homeShellBlock, /display:\s*none/i, "Home route hides the page shell entirely so intro choices are the only visible surface");
    assert.doesNotMatch(shellCss, /body\[data-current-section="resume"\] \.shell[\s\S]*display:\s*none/i, "non-Home routes do not hide the page shell");
}

{
    assert.match(indexHtml, /window\.location\.hash/, "index bootstraps the initial visible route from the hash");
    assert.match(indexHtml, /hash === "resume" \|\| hash === "blog" \|\| hash === "resources"/, "initial bootstrap recognizes the three public routes");
    assert.match(indexHtml, /document\.body\.dataset\.currentSection = section/, "initial bootstrap seeds body currentSection before shell rendering");
    assert.match(indexHtml, /document\.body\.setAttribute\("data-current-section", section\)/, "initial bootstrap mirrors currentSection as a DOM attribute");
}

{
    assert.ok(indexHtml.indexOf('id="intro-choices"') < indexHtml.indexOf('id="resume-shell"'), "intro choices appear before the hidden page shell in the source order");
    assert.ok(indexHtml.includes('data-language-globe'), "page-language control still exists in the page shell source for non-Home routes");
    assert.ok(indexHtml.includes('data-shell-nav="sections"'), "page nav still exists in the page shell source for non-Home routes");
}

{
    const manifestFailureBranch = scriptSource.match(/if \(!loadResult\.ok[\s\S]*?\n\s*return;\n\s*\}/)?.[0] || "";
    assert.ok(manifestFailureBranch, "public boot keeps a manifest-load failure branch");
    assert.match(manifestFailureBranch, /syncCurrentSection\("content-error"\)/, "manifest failure still escapes the hidden Home shell before rendering fallback content");
}

console.log("SBR-025 home intro-only surface assertions passed");
