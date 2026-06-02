import assert from "node:assert/strict";
import fs from "node:fs";

const published = JSON.parse(fs.readFileSync("data/published.json", "utf8"));
const indexHtml = fs.readFileSync("index.html", "utf8");

function extractShellNavLabels(html) {
    return [...html.matchAll(/<a class="shell-nav-link"[^>]*data-section="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((match) => ({
        key: match[1],
        label: match[2]
    }));
}

const htmlLang = indexHtml.match(/<html lang="([^"]+)"/)?.[1] || "";
const globeCurrent = indexHtml.match(/id="language-globe-current"[^>]*>([^<]+)</)?.[1] || "";
const introHint = indexHtml.match(/id="intro-hint"[^>]*>([^<]+)</)?.[1] || "";
const navLabels = extractShellNavLabels(indexHtml);

assert.equal(published.defaultLanguage, "it", "published manifest still defaults to Italian");
assert.deepEqual(published.languages, ["it", "en", "fr"], "published manifest exposes Italian, English and French");
assert.equal(htmlLang, "it", "static HTML still boots with lang=it");
assert.match(indexHtml, /data-language-globe[\s\S]*language-globe-icon[\s\S]*<svg/, "static language globe boots as an icon-only control");
assert.doesNotMatch(indexHtml, /id="language-globe-current"/, "static language globe no longer renders a visible language abbreviation");
assert.match(indexHtml, /data-language-menu[\s\S]*data-lang="it"[\s\S]*data-lang="en"[\s\S]*data-lang="fr"/, "static language menu exposes IT, EN and FR choices");
assert.equal(introHint, "Cosa ti porta qui?", "first-paint Home question matches the active Italian language");
assert.deepEqual(navLabels, [
    { key: "resume", label: "Curriculum" },
    { key: "blog", label: "Blog" },
    { key: "resources", label: "Risorse" }
], "first-paint shell nav labels match the active Italian language");

console.log("SBR-017 initial shell language parity regression assertions passed");
