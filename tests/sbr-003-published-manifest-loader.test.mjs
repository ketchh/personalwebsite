import assert from "node:assert/strict";
import fs from "node:fs";
import { createRenderer } from "../app/render.js";
import {
    MANIFEST_URL,
    PUBLIC_CONTACT_EMAIL,
    createPublishedSource,
    loadPublishedContent
} from "../app/content-loader.js";

function readManifest() {
    return JSON.parse(fs.readFileSync("data/published.json", "utf8"));
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

function allRenderedHtml(source, views = ["home", "resume", "blog", "resources"]) {
    return views.flatMap((view) => Object.keys(source.languages).map((languageKey) =>
        renderView(source, languageKey, view).html
    )).join("\n");
}

function makeDocument(status, marker) {
    return {
        id: `${status}-${marker}`,
        type: marker.includes("resource") ? "resource" : "blogPost",
        status,
        slug: `${status}-${marker}`,
        href: marker.includes("resource") ? `./files/${status}-${marker}.pdf` : `#/blog/${status}-${marker}`,
        privateUploadPath: `/secrets/${marker}.pdf`,
        adminNotes: `ADMIN_ONLY_${marker}`,
        translations: {
            it: {
                title: `${marker} IT title`,
                summary: `${marker} IT summary`,
                description: `${marker} IT description`,
                meta: `${marker} IT meta`,
                label: `${marker} IT label`
            },
            en: {
                title: `${marker} EN title`,
                summary: `${marker} EN summary`,
                description: `${marker} EN description`,
                meta: `${marker} EN meta`,
                label: `${marker} EN label`
            },
            fr: {
                title: `${marker} FR title`,
                summary: `${marker} FR summary`,
                description: `${marker} FR description`,
                meta: `${marker} FR meta`,
                label: `${marker} FR label`
            }
        }
    };
}

const manifest = readManifest();

assert.equal(manifest.schemaVersion, 1, "published manifest declares schemaVersion 1");
assert.equal(typeof manifest.generatedAt, "string", "published manifest includes generatedAt");
assert.ok(!Number.isNaN(Date.parse(manifest.generatedAt)), "generatedAt is parseable as a timestamp");
assert.equal(manifest.defaultLanguage, "it", "published manifest keeps IT as default language");
assert.deepEqual(manifest.languages, ["it", "en", "fr"], "published manifest declares IT/EN/FR languages in order");
assert.equal(typeof manifest.site, "object", "published manifest includes site data");
assert.equal(manifest.resume?.status, "published", "published manifest includes one published Resume document");
assert.equal(manifest.resume?.type, "resume", "published manifest Resume document is typed");
assert.ok(manifest.resume?.translations?.it, "Resume has IT translation");
assert.ok(manifest.resume?.translations?.en, "Resume has EN translation");
assert.ok(manifest.resume?.translations?.fr, "Resume has FR translation");
assert.ok(Array.isArray(manifest.blogPosts), "published manifest includes blogPosts array");
assert.ok(Array.isArray(manifest.resources), "published manifest includes resources array");

{
    const calls = [];
    const result = await loadPublishedContent({
        fetchImpl: async (url) => {
            calls.push(url);
            return {
                ok: true,
                status: 200,
                json: async () => manifest
            };
        }
    });

    assert.deepEqual(calls, [MANIFEST_URL], "loader fetches data/published.json exactly once before exposing content");
    assert.equal(result.ok, true, "valid manifest load succeeds");
    assert.ok(result.source?.languages?.it, "loader returns normalized IT content");
    assert.ok(result.source?.languages?.en, "loader returns normalized EN content");
    assert.ok(result.source?.languages?.fr, "loader returns normalized FR content");
    assert.equal(result.source.defaultLanguage, "it", "normalized public source preserves default language");
}

{
    const script = fs.readFileSync("script.js", "utf8");
    const loadIndex = script.indexOf("await loadPublishedContent");
    const firstRenderIndex = script.indexOf("renderer.renderApp(initialData)");

    assert.match(script, /from\s+["']\.\/app\/content-loader\.js/, "public script imports the published content loader");
    assert.ok(loadIndex !== -1, "public script awaits the manifest loader");
    assert.ok(firstRenderIndex !== -1, "public script still performs an initial app render");
    assert.ok(loadIndex < firstRenderIndex, "manifest load is awaited before the first app render");
    assert.doesNotMatch(script, /const\s+source\s*=\s*window\.PORTFOLIO_CONTENT\s*;/, "window.PORTFOLIO_CONTENT is not assigned as the primary public source");
    assert.doesNotMatch(fs.readFileSync("index.html", "utf8"), /<script\s+src="content\.js/, "public HTML no longer loads content.js as the primary source");
}

{
    const source = createPublishedSource(manifest);

    for (const view of ["home", "resume", "blog", "resources"]) {
        const it = renderView(source, "it", view);
        const itFields = it.renderer.buildRenderableFields(source.languages.it);

        for (const languageKey of Object.keys(source.languages).filter((key) => key !== "it")) {
            const localized = renderView(source, languageKey, view);
            const localizedFields = localized.renderer.buildRenderableFields(source.languages[languageKey]);
            assert.deepEqual(itFields.map((field) => field.key), localizedFields.map((field) => field.key), `${view}: IT/${languageKey.toUpperCase()} patch keys stay aligned from manifest-derived source`);
            assert.equal(itFields.length, localizedFields.length, `${view}: IT/${languageKey.toUpperCase()} field counts stay aligned from manifest-derived source`);
        }
    }

    const blogHtml = allRenderedHtml(source, ["blog"]);
    const resourcesHtml = allRenderedHtml(source, ["resources"]);

    assert.doesNotMatch(blogHtml + resourcesHtml, /content\.js ready \/ static blog slot/i, "manifest-derived empty states do not expose old development meta copy");
    assert.doesNotMatch(blogHtml, /Nessun post pubblicato per ora|No posts published yet/i, "manifest-derived Blog empty state avoids old placeholder heading");
    assert.match(blogHtml, /blog in preparazione|blog is being prepared|blog en préparation/i, "manifest-derived Blog renders an intentional empty state");
    assert.match(resourcesHtml, /risorse in preparazione|resources are being prepared|ressources en préparation/i, "manifest-derived Resources renders an intentional empty state");
}

{
    const fixture = structuredClone(manifest);
    fixture.blogPosts = [
        makeDocument("draft", "SECRET_DRAFT_BLOG"),
        makeDocument("archived", "SECRET_ARCHIVED_BLOG"),
        makeDocument("published", "PUBLIC_BLOG")
    ];
    fixture.resources = [
        makeDocument("draft", "SECRET_DRAFT_resource"),
        makeDocument("archived", "SECRET_ARCHIVED_resource"),
        makeDocument("published", "PUBLIC_resource")
    ];

    const source = createPublishedSource(fixture);
    const rendered = allRenderedHtml(source, ["blog", "resources"]);

    assert.match(rendered, /PUBLIC_BLOG IT title|PUBLIC_BLOG EN title|PUBLIC_BLOG FR title/, "published blog documents render publicly");
    assert.match(rendered, /PUBLIC_resource IT title|PUBLIC_resource EN title|PUBLIC_resource FR title/, "published resource documents render publicly");
    assert.doesNotMatch(rendered, /SECRET_DRAFT|SECRET_ARCHIVED|ADMIN_ONLY|\/secrets\//, "drafts, archived docs, private upload paths, and admin metadata stay out of public HTML");
}

{
    const resourceFixture = structuredClone(manifest);
    resourceFixture.resources = [
        {
            id: "resource-xss",
            type: "resource",
            status: "published",
            href: "javascript:alert(1)",
            translations: {
                it: { title: "Risorsa", summary: "Link da validare", label: "Apri" },
                en: { title: "Resource", summary: "Link to validate", label: "Open" },
                fr: { title: "Ressource", summary: "Lien à valider", label: "Ouvrir" }
            }
        }
    ];

    assert.throws(
        () => createPublishedSource(resourceFixture),
        /published manifest|href|url|scheme/i,
        "published manifests reject javascript: Resource hrefs before they can render executable public links"
    );

    const heroFixture = structuredClone(manifest);
    heroFixture.resume.translations.en.hero.actions = [
        {
            label: PUBLIC_CONTACT_EMAIL,
            href: "javascript:alert(1)",
            action: "email",
            primary: true
        }
    ];

    assert.throws(
        () => createPublishedSource(heroFixture),
        /published manifest|href|url|scheme/i,
        "published manifests reject javascript: Resume hero action hrefs before they can render executable public links"
    );
}

{
    const invalidCases = [
        ["bad schemaVersion", { ...manifest, schemaVersion: 2 }],
        ["bad defaultLanguage", { ...manifest, defaultLanguage: "en" }],
        ["missing EN language", { ...manifest, languages: ["it", "fr"] }],
        ["missing Resume EN translation", { ...manifest, resume: { ...manifest.resume, translations: { it: manifest.resume.translations.it } } }],
        ["draft Resume", { ...manifest, resume: { ...manifest.resume, status: "draft" } }]
    ];

    for (const [label, invalidManifest] of invalidCases) {
        assert.throws(() => createPublishedSource(invalidManifest), /published manifest/i, `${label}: invalid manifest is rejected before render`);
    }

    const missing = await loadPublishedContent({
        fetchImpl: async () => ({ ok: false, status: 404, statusText: "Not Found" })
    });
    assert.equal(missing.ok, false, "missing manifest load returns a controlled failure");
    assert.match(missing.error.message, /data\/published\.json|404/, "missing manifest failure names the manifest path/status");

    const malformed = await loadPublishedContent({
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => {
                throw new SyntaxError("Unexpected token < in JSON");
            }
        })
    });
    assert.equal(malformed.ok, false, "malformed JSON load returns a controlled failure");
    assert.match(malformed.error.message, /Unexpected token|published manifest/i, "malformed JSON failure remains inspectable without throwing uncaught");
}

{
    const app = { innerHTML: "" };
    const renderer = createRenderer({
        app,
        summarySectionFallback: { path: "./summary", number: "01", title: "Summary" },
        getCurrentView: () => "resume"
    });

    renderer.renderContentError(new Error("published manifest invalid"));

    assert.match(app.innerHTML, /content-error-card/, "failure state renders an error card into #resume-app");
    assert.match(app.innerHTML, /published content unavailable|contenuto pubblico non disponibile/i, "failure state is human-readable");
    assert.match(app.innerHTML, new RegExp(PUBLIC_CONTACT_EMAIL.replaceAll(".", "\\.")), "failure state shows the email address visibly");
    assert.match(app.innerHTML, new RegExp(`href=\"mailto:${PUBLIC_CONTACT_EMAIL.replaceAll(".", "\\.")}\"`), "failure state keeps a mailto contact link");

    const indexHtml = fs.readFileSync("index.html", "utf8");
    assert.match(indexHtml, /data-language-globe/, "global language control remains present in the public shell");
    assert.match(indexHtml, /#\/resume/, "Resume route remains present in the public shell");
    assert.match(indexHtml, /#\/blog/, "Blog route remains present in the public shell");
    assert.match(indexHtml, /#\/resources/, "Resources route remains present in the public shell");
}

console.log("SBR-003 published manifest loader assertions passed");
