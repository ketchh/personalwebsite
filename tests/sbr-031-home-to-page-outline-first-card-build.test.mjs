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
        getCurrentView: () => view
    });

    renderer.renderHomeEnterFrame(source.languages[languageKey], view, { phase });
    return app.innerHTML;
}

const source = readSource();
const renderSource = fs.readFileSync("app/render.js", "utf8");
const patchEngineSource = fs.readFileSync("app/patch-engine.js", "utf8");
const shellCss = fs.readFileSync("styles/shell.css", "utf8");
const patchCss = fs.readFileSync("styles/patch.css", "utf8");

assert.match(renderSource, /blankPatchText|renderBlankPatchFrame|renderHomeEnterOutline/i, "renderer has an outline-first/blank-text Home-enter render path instead of mounting full page copy immediately");
assert.match(patchEngineSource, /buildRenderableFields\(entry\.data\)|animateHomeEnterRenderableFields/s, "Home-enter content phase patches destination renderable fields from empty text instead of only animating the temporary heading/copy card");
assert.match(patchEngineSource, /promoteHomeEnterFrameToContent/s, "Home-enter content phase promotes the already-built outline surface instead of re-rendering and restarting the visual build");
assert.doesNotMatch(patchEngineSource, /renderHomeEnterFrame\(entry\.data, targetView, \{ phase: "content" \}\)/, "Home-enter content phase does not re-render duplicate page surfaces after outlines are established");
assert.match(patchCss + shellCss, /home-enter-card-outline-build|home-enter-outline/s, "CSS exposes a dedicated card-outline build hook for the Home→page structure-first stage");
assert.match(patchCss + shellCss, /home-enter-page-expand|--home-enter-page-expanded-height/s, "Home-enter page surface expands during the staged build instead of staying clipped until idle");
assert.match(patchCss, /\[data-home-enter-page-surface\] \[data-patch-key\]:empty::before|hero-summary[\s\S]*min-height/s, "blank staged patch fields reserve final text space so card outlines do not jump while text fills");
assert.match(shellCss, /data-route-phase="frame"[\s\S]*\.home-enter-selection,[\s\S]*\.home-enter-frame-card[\s\S]*position:\s*absolute/s, "frame phase removes the temporary selection/frame card from normal layout so real destination card outlines occupy the viewport first");

const forbiddenEarlyCopy = {
    resume: source.languages.en.hero.summary,
    blog: source.languages.en.sectionChooser.choices.find((choice) => choice.key === "blog").copy,
    resources: source.languages.en.sectionChooser.choices.find((choice) => choice.key === "resources").copy
};

for (const view of ["resume", "blog", "resources"]) {
    const frameHtml = renderHomeEnterFrame(source, "en", view, "frame");
    const contentHtml = renderHomeEnterFrame(source, "en", view, "content");
    const earlyCopy = forbiddenEarlyCopy[view];

    assert.match(frameHtml, /data-home-enter-page-surface/, `${view}: frame phase still mounts destination card structure`);
    assert.match(frameHtml, /class="[^"]*card/, `${view}: frame phase includes card boxes/outlines`);
    assert.doesNotMatch(frameHtml, new RegExp(earlyCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${view}: frame phase does not mount full destination copy before outlines are established`);

    assert.match(contentHtml, /data-home-enter-live-route/, `${view}: content phase mounts the live route-shaped surface for text patching`);
    assert.equal((contentHtml.match(/data-home-enter-page-surface/g) || []).length, 1, `${view}: content phase keeps one page surface instead of duplicate stacked surfaces`);
    assert.match(contentHtml, /data-home-enter-page-surface[^>]*data-home-enter-live-route|data-home-enter-live-route[^>]*data-home-enter-page-surface/, `${view}: page surface and live route are the same staged surface to prevent visual ghosting`);
    assert.match(contentHtml, /data-patch-key=/, `${view}: content phase keeps patchable fields in the live route-shaped surface`);
    assert.doesNotMatch(contentHtml, new RegExp(earlyCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${view}: content phase starts from blank patch fields instead of full destination copy`);
}

console.log("SBR-031 home-to-page outline-first card build assertions passed");
