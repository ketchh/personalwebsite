import assert from "node:assert/strict";
import fs from "node:fs";
import { createPublishedSource, PUBLIC_CONTACT_EMAIL } from "../app/content-loader.js";
import { createRenderer } from "../app/render.js";

function readSource() {
    return createPublishedSource(JSON.parse(fs.readFileSync("data/published.json", "utf8")));
}

function createApp() {
    return {
        innerHTML: "",
        setAttribute() {},
        querySelector() {
            return null;
        }
    };
}

function renderRoute(source, languageKey, view) {
    const app = createApp();
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => view
    });

    renderer.renderApp(source.languages[languageKey]);
    return { html: app.innerHTML, renderer };
}

function renderHomeEnterFrame(source, languageKey, view, phase) {
    const app = createApp();
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => "home"
    });

    renderer.renderHomeEnterFrame(source.languages[languageKey], view, { phase });
    return app.innerHTML;
}

const source = readSource();
const contentLoaderSource = fs.readFileSync("app/content-loader.js", "utf8");
const renderSource = fs.readFileSync("app/render.js", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const patchCss = fs.readFileSync("styles/patch.css", "utf8");

assert.equal(PUBLIC_CONTACT_EMAIL, "alessandro@sbar.si", "public contact constant uses the new sbar.si mailbox");
assert.match(contentLoaderSource, /PUBLIC_CONTACT_EMAIL = "alessandro@sbar\.si"/, "content loader default email is updated");
assert.match(renderSource, /data-home-enter-page-surface/, "renderer exposes a deterministic destination-page ingress marker during Home→page transitions");
assert.match(renderSource, /data-home-enter-live-route/, "renderer also exposes a deterministic live-route continuity marker so the final route does not pop in abruptly after the staged build");
assert.match(shellCss + patchCss, /home-enter-page-surface|data-home-enter-page-surface/, "CSS styles the destination-page ingress surface instead of letting the page pop in unanimated");
assert.match(shellCss + patchCss, /home-enter-live-route|data-home-enter-live-route/, "CSS also styles the live-route continuity surface so the final route inherits the same page-build grammar");
assert.doesNotMatch(indexHtml, /<footer class="statusbar"/, "public shell source no longer renders a visible statusbar footer");
assert.doesNotMatch(indexHtml, /\[F1\] resume \[F2\] blog \[F3\] resources|translation::ready \/ reverse \/ word \/ slow/, "legacy footer/status strings are absent from the visible shell source");
assert.match(shellCss, /\.fact-item,\s*\n\.contact-item\s*\{[\s\S]*grid-template-columns:\s*1fr/, "facts and contacts now stack label/value vertically on page surfaces");
assert.doesNotMatch(shellCss, /grid-template-columns:\s*132px\s+1fr/, "desktop facts/contacts no longer reserve a fixed side-by-side metadata column");
assert.match(shellCss, /\.fact-value,\s*\n\.contact-value,\s*\n\.contact-link\s*\{[\s\S]*(?:overflow-wrap|word-break):\s*(?:anywhere|break-word)/, "fact and contact values wrap inside their cards instead of overflowing");

for (const view of ["resume", "blog", "resources"]) {
    const frameHtml = renderHomeEnterFrame(source, "en", view, "frame");
    const contentHtml = renderHomeEnterFrame(source, "en", view, "content");
    const frameSurfaceTag = frameHtml.match(/<div class="home-enter-page-surface"[^>]*>/)?.[0] || "";
    const contentSurfaceTag = contentHtml.match(/<div class="home-enter-page-surface"[^>]*>/)?.[0] || "";

    assert.match(frameHtml, new RegExp(`data-home-enter-page-surface[^>]*data-home-enter-page-view="${view}"`), `${view}: frame phase already mounts the destination-page ingress surface`);
    assert.match(frameHtml, /data-page-rail-frame/, `${view}: frame phase carries the destination page shell instead of waiting for a later pop-in render`);
    assert.match(frameSurfaceTag, /\binert\b/, `${view}: frame-phase destination preview stays inert so duplicate links/buttons cannot enter tab order before the final route render`);
    assert.match(contentHtml, /data-home-enter-page-surface/, `${view}: content phase keeps the destination-page ingress surface mounted`);
    assert.match(contentHtml, new RegExp(`data-home-enter-live-route[^>]*data-home-enter-live-view="${view}"`), `${view}: content phase also mounts a deterministic live-route continuity surface before the final route render`);
    assert.match(contentSurfaceTag, /\binert\b/, `${view}: content-phase destination preview stays inert until the final route render replaces the transition surface`);
}

for (const languageKey of ["it", "en"]) {
    const { html } = renderRoute(source, languageKey, "resume");
    assert.match(html, /mailto:alessandro@sbar\.si/, `${languageKey}: resume route exposes the new mailto target`);
    assert.match(html, /data-patch-key="hero-action-0"[^>]*>alessandro@sbar\.si<\/a>/, `${languageKey}: hero primary action label uses the new mailbox`);
    assert.match(html, /data-patch-key="panel-\d+-contact-0-value" href="mailto:alessandro@sbar\.si">alessandro@sbar\.si<\/a>/, `${languageKey}: contacts panel email row uses the new mailbox`);
}

{
    const { html } = renderRoute(source, "it", "resume");
    assert.match(html, /data-patch-key="fact-0-label">Base<\/span>[\s\S]*data-patch-key="fact-0-value">Milano, Lombardia, Italia<\/span>/, "IT summary facts still render the location value inside the stacked fact surface");
    assert.match(html, /data-patch-key="fact-2-label">Esperienza attuale<\/span>[\s\S]*data-patch-key="fact-2-value">Aly Service \/ Sviluppatore \/ apr 2024 - presente<\/span>/, "IT summary facts still render the current experience value inside the stacked fact surface");
}

console.log("SBR-027 public arrival, contact, and shell polish assertions passed");
