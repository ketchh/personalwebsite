import assert from "node:assert/strict";
import fs from "node:fs";
import { createPublishedSource } from "../app/content-loader.js";
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
const renderSource = fs.readFileSync("app/render.js", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const patchCss = fs.readFileSync("styles/patch.css", "utf8");

assert.match(renderSource, /data-home-enter-live-route/, "renderer exposes a deterministic live-route continuity surface during Home→page content phase");
assert.match(shellCss + patchCss, /home-enter-live-route|data-home-enter-live-route/, "CSS/animation rules target the live-route continuity surface");
assert.match(patchCss, /@keyframes home-enter-live-route-rise/, "a dedicated live-route continuity animation exists for the final handoff into the real page");

for (const view of ["resume", "blog", "resources"]) {
    const frameHtml = renderHomeEnterFrame(source, "en", view, "frame");
    const contentHtml = renderHomeEnterFrame(source, "en", view, "content");

    assert.doesNotMatch(frameHtml, /data-home-enter-live-route/, `${view}: frame phase still focuses on staged page build before the final live-route continuity surface appears`);
    assert.match(contentHtml, new RegExp(`data-home-enter-live-route[^>]*data-home-enter-live-view="${view}"`), `${view}: content phase mounts a deterministic live-route continuity surface for the real page`);
    assert.match(contentHtml, /data-home-enter-page-surface/, `${view}: staged preview remains present while the live route begins entering, preventing an abrupt final replacement`);
}

console.log("SBR-029 home-to-page live route continuity assertions passed");
