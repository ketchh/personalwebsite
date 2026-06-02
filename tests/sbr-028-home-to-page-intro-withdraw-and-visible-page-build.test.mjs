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
const introCss = fs.readFileSync("styles/intro.css", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const patchCss = fs.readFileSync("styles/patch.css", "utf8");

assert.match(renderSource, /data-home-enter-page-surface/, "renderer keeps a deterministic destination-page ingress surface during Home→page transitions");
assert.match(renderSource, /data-home-enter-live-route/, "renderer also exposes a deterministic live-route continuity surface during Home→page content phase");
assert.match(shellCss + patchCss, /home-enter-page-surface|data-home-enter-page-surface/, "CSS still targets the destination-page ingress surface");
assert.match(shellCss + patchCss, /home-enter-live-route|data-home-enter-live-route/, "CSS also targets the live-route continuity surface so the final route does not appear all at once");

assert.match(
    introCss,
    /body\[data-route-transition="home-enter"\]\[data-route-phase="clearing"\] \.site-intro-title[\s\S]*body\[data-route-transition="home-enter"\]\[data-route-phase="content"\] \.intro-cursor/s,
    "Home-enter CSS explicitly targets the lingering greeting/title and cursor across the active lifecycle"
);

assert.match(
    introCss,
    /body\[data-route-transition="home-enter"\]\[data-route-phase="clearing"\] \.site-intro-title[\s\S]*opacity:\s*0/s,
    "the lingering Home greeting is withdrawn instead of remaining visible over the page build"
);

assert.match(
    introCss,
    /body\[data-route-transition="home-enter"\]\[data-route-phase="content"\] \.intro-cursor[\s\S]*opacity:\s*0/s,
    "the lingering Home cursor is withdrawn instead of blinking over the destination page build"
);

assert.match(
    introCss,
    /body\[data-route-transition="home-enter"\]\[data-route-phase="frame"\] \.site-intro-inner[\s\S]*opacity:\s*0[\s\S]*pointer-events:\s*none/s,
    "once frame begins, the old Home intro stack yields the surface so the destination page can become the primary visible feedback"
);

assert.match(
    shellCss,
    /\[data-route-transition="home-enter"\]\[data-route-phase="frame"\] \.home-enter-page-surface[\s\S]*opacity:\s*0\.[6-9]/,
    "frame phase gives the destination page enough visible opacity to read as the active page build instead of a hidden off-screen wait"
);

for (const view of ["resume", "blog", "resources"]) {
    const frameHtml = renderHomeEnterFrame(source, "en", view, "frame");
    const contentHtml = renderHomeEnterFrame(source, "en", view, "content");

    assert.match(frameHtml, new RegExp(`data-home-enter-page-surface[^>]*data-home-enter-page-view="${view}"`), `${view}: frame phase mounts the destination-page ingress surface`);
    assert.match(frameHtml, /data-page-rail-frame/, `${view}: frame phase already carries destination page structure instead of waiting for final render`);
    assert.match(contentHtml, /data-home-enter-page-surface/, `${view}: content phase keeps the destination page mounted while copy patches continue`);
    assert.match(contentHtml, new RegExp(`data-home-enter-live-route[^>]*data-home-enter-live-view="${view}"`), `${view}: content phase also mounts a live-route continuity surface before the final route render`);
}

console.log("SBR-028 home-to-page intro withdrawal and visible page build assertions passed");
