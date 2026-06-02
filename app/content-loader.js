export const MANIFEST_URL = "data/published.json";
export const PUBLIC_CONTACT_EMAIL = "alessandro@sbar.si";

const SUPPORTED_SCHEMA_VERSION = 1;
const BASE_REQUIRED_LANGUAGES = ["it", "en"];
const LANGUAGE_KEY_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)*$/;
const SAFE_HREF_SCHEMES = new Set(["http:", "https:", "mailto:"]);

const EMPTY_STATES = {
    blog: {
        it: {
            number: "06",
            path: "./blog",
            title: "Blog",
            eyebrow: "published-only",
            heading: "Blog in preparazione",
            meta: "nessun articolo pubblico esportato",
            copy: "Gli articoli compariranno qui solo quando saranno pubblicati in parallelo multilingue."
        },
        en: {
            number: "06",
            path: "./blog",
            title: "Blog",
            eyebrow: "published-only",
            heading: "Blog is being prepared",
            meta: "no public article exported",
            copy: "Articles will appear here only after they are published in parallel multilingual versions."
        },
        fr: {
            number: "06",
            path: "./blog",
            title: "Blog",
            eyebrow: "published-only",
            heading: "Blog en préparation",
            meta: "aucun article public exporté",
            copy: "Les articles apparaîtront ici uniquement après une publication parallèle multilingue."
        }
    },
    resources: {
        it: {
            number: "07",
            path: "./resources",
            title: "Resources",
            eyebrow: "published-only",
            heading: "Risorse in preparazione",
            meta: "nessuna risorsa pubblica esportata",
            copy: "Link e file compariranno qui solo dopo una pubblicazione esplicita e multilingue."
        },
        en: {
            number: "07",
            path: "./resources",
            title: "Resources",
            eyebrow: "published-only",
            heading: "Resources are being prepared",
            meta: "no public resource exported",
            copy: "Links and files will appear here only after an explicit multilingual publication."
        },
        fr: {
            number: "07",
            path: "./resources",
            title: "Ressources",
            eyebrow: "published-only",
            heading: "Ressources en préparation",
            meta: "aucune ressource publique exportée",
            copy: "Les liens et fichiers apparaîtront ici uniquement après une publication multilingue explicite."
        }
    }
};

function cloneJson(value, fallback) {
    if (typeof value === "undefined") {
        return fallback;
    }

    return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function manifestError(message) {
    return new Error(`Invalid published manifest: ${message}`);
}

function requireObject(value, path) {
    if (!isObject(value)) {
        throw manifestError(`${path} must be an object.`);
    }

    return value;
}

function requireArray(value, path) {
    if (!Array.isArray(value)) {
        throw manifestError(`${path} must be an array.`);
    }

    return value;
}

function requireString(value, path) {
    if (typeof value !== "string" || !value.trim()) {
        throw manifestError(`${path} must be a non-empty string.`);
    }

    return value;
}

function assertSupportedLanguages(languages) {
    requireArray(languages, "languages");

    if (!languages.length) {
        throw manifestError("languages must include at least one language.");
    }

    const seen = new Set();

    languages.forEach((language, index) => {
        if (typeof language !== "string" || language !== language.trim() || !LANGUAGE_KEY_PATTERN.test(language)) {
            throw manifestError(`languages[${index}] must be a lowercase BCP-47 style language key.`);
        }

        if (seen.has(language)) {
            throw manifestError(`languages must not repeat "${language}".`);
        }

        seen.add(language);
    });

    if (languages[0] !== "it") {
        throw manifestError('languages[0] must be "it".');
    }

    BASE_REQUIRED_LANGUAGES.forEach((language) => {
        if (!seen.has(language)) {
            throw manifestError(`languages must include ${BASE_REQUIRED_LANGUAGES.join(", ")}.`);
        }
    });
}

function requireTranslations(document, path, languages) {
    requireObject(document, path);
    const translations = requireObject(document.translations, `${path}.translations`);

    languages.forEach((language) => {
        requireObject(translations[language], `${path}.translations.${language}`);
    });

    return translations;
}

function requireLocalizedSiteBlock(site, blockName, languages) {
    const block = requireObject(site[blockName], `site.${blockName}`);
    const translations = requireObject(block.translations, `site.${blockName}.translations`);

    languages.forEach((language) => {
        requireObject(translations[language], `site.${blockName}.translations.${language}`);
    });

    return translations;
}

function getPublishedDocuments(documents, type, languages, path) {
    return requireArray(documents, path)
        .filter((document) => document && document.status === "published")
        .map((document, index) => {
            const documentPath = `${path}[published:${index}]`;
            requireObject(document, documentPath);

            if (document.type && document.type !== type) {
                throw manifestError(`${documentPath}.type must be "${type}".`);
            }

            requireTranslations(document, documentPath, languages);
            validatePublicHrefTree(document, documentPath);
            return document;
        });
}

function isPrivateReference(value) {
    if (typeof value !== "string") {
        return false;
    }

    return /(^|\/)(?:\.\.|secrets?|credentials?|private|drafts?|admin)(?:\/|$)|^\/home\//i.test(value);
}

function validatePublicHref(href, path) {
    if (typeof href !== "string") {
        throw manifestError(`${path} must be a string href.`);
    }

    const trimmedHref = href.trim();

    if (!trimmedHref) {
        return "";
    }

    if (/[\u0000-\u001f\u007f\s]/.test(trimmedHref)) {
        throw manifestError(`${path} contains whitespace or control characters.`);
    }

    if (trimmedHref.startsWith("//")) {
        throw manifestError(`${path} must not use a protocol-relative URL.`);
    }

    if (isPrivateReference(trimmedHref)) {
        throw manifestError(`${path} points to a private or non-public path.`);
    }

    const schemeProbe = trimmedHref.replace(/[\u0000-\u001f\u007f\s]+/g, "");
    const schemeMatch = schemeProbe.match(/^([a-z][a-z0-9+.-]*):/i);

    if (schemeMatch) {
        const scheme = `${schemeMatch[1].toLowerCase()}:`;

        if (!SAFE_HREF_SCHEMES.has(scheme)) {
            throw manifestError(`${path} uses unsafe URL scheme "${scheme}".`);
        }
    }

    return trimmedHref;
}

function validatePublicHrefTree(value, path) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => validatePublicHrefTree(item, `${path}[${index}]`));
        return;
    }

    if (!isObject(value)) {
        return;
    }

    Object.entries(value).forEach(([key, child]) => {
        const childPath = `${path}.${key}`;

        if (key === "href" && typeof child !== "undefined" && child !== null) {
            validatePublicHref(child, childPath);
            return;
        }

        validatePublicHrefTree(child, childPath);
    });
}

function validateSectionChooserLinks(translation, path) {
    if (!isObject(translation) || !Array.isArray(translation.choices)) {
        return;
    }

    translation.choices.forEach((choice, index) => {
        if (isObject(choice) && Object.prototype.hasOwnProperty.call(choice, "path")) {
            validatePublicHref(choice.path, `${path}.choices[${index}].path`);
        }
    });
}

function getPublicHref(document, path) {
    if (!document || typeof document.href === "undefined" || document.href === null) {
        return "";
    }

    return validatePublicHref(document.href, `${path}.href`);
}

function buildEmptyPanel(kind, language, override) {
    const fallback = EMPTY_STATES[kind][language] || EMPTY_STATES[kind].en;
    const state = { ...fallback, ...(override || {}) };

    return {
        number: state.number,
        path: state.path,
        title: state.title,
        kind: "entries",
        view: kind,
        entries: [
            {
                eyebrow: state.eyebrow,
                heading: state.heading,
                meta: state.meta,
                copy: state.copy
            }
        ]
    };
}

function buildBlogPanel(documents, language, emptyState) {
    if (!documents.length) {
        return buildEmptyPanel("blog", language, emptyState);
    }

    return {
        number: "06",
        path: "./blog",
        title: "Blog",
        kind: "entries",
        view: "blog",
        entries: documents.map((document) => {
            const translation = document.translations[language] || {};
            const href = getPublicHref(document, `blogPosts.${document.id || "published"}`);

            return {
                eyebrow: translation.eyebrow || document.publishedAt || "published",
                heading: translation.title || "",
                meta: translation.meta || translation.date || document.publishedAt || "published",
                copy: translation.summary || translation.description || "",
                ...(href ? { href, label: translation.label || "Read" } : {})
            };
        })
    };
}

function buildResourcesPanel(documents, language, emptyState) {
    if (!documents.length) {
        return buildEmptyPanel("resources", language, emptyState);
    }

    return {
        number: "07",
        path: "./resources",
        title: "Resources",
        kind: "entries",
        span: "wide",
        view: "resources",
        entries: documents.map((document) => {
            const translation = document.translations[language] || {};
            const href = getPublicHref(document, `resources.${document.id || "published"}`);

            return {
                eyebrow: translation.eyebrow || document.kind || "resource",
                heading: translation.title || "",
                meta: translation.meta || document.publishedAt || "published resource",
                copy: translation.summary || translation.description || "",
                ...(href ? { href, label: translation.label || "Open" } : {})
            };
        })
    };
}

function getEmptyState(site, kind, language) {
    const emptyStates = site.emptyStates;

    if (!isObject(emptyStates) || !isObject(emptyStates[kind]) || !isObject(emptyStates[kind].translations)) {
        return null;
    }

    const translation = emptyStates[kind].translations[language];
    return isObject(translation) ? translation : null;
}

function validatePublishedManifest(manifest) {
    requireObject(manifest, "published manifest");

    if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        throw manifestError(`schemaVersion must be ${SUPPORTED_SCHEMA_VERSION}.`);
    }

    requireString(manifest.generatedAt, "generatedAt");

    if (Number.isNaN(Date.parse(manifest.generatedAt))) {
        throw manifestError("generatedAt must be an ISO-8601 timestamp.");
    }

    if (manifest.defaultLanguage !== "it") {
        throw manifestError('defaultLanguage must be "it".');
    }

    const languages = manifest.languages;
    assertSupportedLanguages(languages);

    const site = requireObject(manifest.site, "site");
    requireObject(site.intro, "site.intro");
    const uiTranslations = requireLocalizedSiteBlock(site, "ui", languages);
    const sectionChooserTranslations = requireLocalizedSiteBlock(site, "sectionChooser", languages);
    const summarySectionTranslations = requireLocalizedSiteBlock(site, "summarySection", languages);

    const resume = requireObject(manifest.resume, "resume");

    if (resume.status !== "published") {
        throw manifestError('resume.status must be "published".');
    }

    if (resume.type !== "resume") {
        throw manifestError('resume.type must be "resume".');
    }

    const resumeTranslations = requireTranslations(resume, "resume", languages);
    languages.forEach((language) => {
        const resumeTranslation = resumeTranslations[language];
        requireObject(resumeTranslation.hero, `resume.translations.${language}.hero`);
        requireArray(resumeTranslation.facts, `resume.translations.${language}.facts`);
        requireArray(resumeTranslation.panels, `resume.translations.${language}.panels`);
        validatePublicHrefTree(resumeTranslation, `resume.translations.${language}`);
        validateSectionChooserLinks(sectionChooserTranslations[language], `site.sectionChooser.translations.${language}`);
    });

    const publishedBlogPosts = getPublishedDocuments(manifest.blogPosts, "blogPost", languages, "blogPosts");
    const publishedResources = getPublishedDocuments(manifest.resources, "resource", languages, "resources");

    return {
        languages,
        site,
        uiTranslations,
        sectionChooserTranslations,
        summarySectionTranslations,
        resumeTranslations,
        publishedBlogPosts,
        publishedResources
    };
}

export function createPublishedSource(manifest) {
    const validated = validatePublishedManifest(manifest);
    const source = {
        defaultLanguage: validated.languages.includes(manifest.defaultLanguage) ? manifest.defaultLanguage : "it",
        introSite: cloneJson(validated.site.intro, {}),
        languages: {}
    };

    validated.languages.forEach((language) => {
        const resumeTranslation = validated.resumeTranslations[language];
        const resumePanels = cloneJson(resumeTranslation.panels, [])
            .filter((panel) => !panel || !panel.view || panel.view === "resume");

        source.languages[language] = {
            htmlLang: typeof resumeTranslation.htmlLang === "string" ? resumeTranslation.htmlLang : language,
            ui: cloneJson(validated.uiTranslations[language], {}),
            summarySection: cloneJson(validated.summarySectionTranslations[language], {}),
            hero: cloneJson(resumeTranslation.hero, {}),
            facts: cloneJson(resumeTranslation.facts, []),
            panels: [
                ...resumePanels,
                buildBlogPanel(validated.publishedBlogPosts, language, getEmptyState(validated.site, "blog", language)),
                buildResourcesPanel(validated.publishedResources, language, getEmptyState(validated.site, "resources", language))
            ],
            sectionChooser: cloneJson(validated.sectionChooserTranslations[language], {})
        };
    });

    return source;
}

function toLoadError(error) {
    if (error instanceof Error) {
        return error;
    }

    return new Error(String(error || "Unknown published manifest error"));
}

export async function loadPublishedContent(options = {}) {
    const manifestUrl = options.manifestUrl || MANIFEST_URL;
    const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);

    if (!fetchImpl) {
        return {
            ok: false,
            error: new Error(`Unable to fetch ${manifestUrl}: Fetch API is not available.`)
        };
    }

    try {
        const response = await fetchImpl(manifestUrl, {
            cache: "no-cache",
            headers: { Accept: "application/json" }
        });

        if (!response || !response.ok) {
            const status = response && response.status ? ` ${response.status}` : "";
            const statusText = response && response.statusText ? ` ${response.statusText}` : "";
            throw new Error(`Unable to fetch ${manifestUrl}:${status}${statusText}`.trim());
        }

        const manifest = await response.json();
        return {
            ok: true,
            manifest,
            source: createPublishedSource(manifest)
        };
    } catch (error) {
        return {
            ok: false,
            error: toLoadError(error)
        };
    }
}
