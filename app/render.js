import { escapeHtml } from "./shared.js";

const VIEW_KEYS = ["resume", "blog", "resources"];
const PUBLIC_CONTACT_EMAIL = "alessandro@sbar.si";

function renderTextElement(tagName, className, key, text, extraAttributes) {
    const classAttribute = className ? ` class="${className}"` : "";
    const attributes = extraAttributes ? ` ${extraAttributes}` : "";
    return `<${tagName}${classAttribute} data-patch-key="${key}"${attributes}>${escapeHtml(text || "")}</${tagName}>`;
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function pushField(fields, key, text, group, extra) {
    fields.push({
        key,
        text: text || "",
        group,
        ...(extra || {})
    });
}

function getLinkAttributes(item) {
    if (!item || !item.href) {
        return "";
    }

    const isExternal = /^https?:/i.test(item.href);
    const target = isExternal ? ' target="_blank" rel="noreferrer"' : "";
    const download = item.download ? " download" : "";

    return ` href="${escapeHtml(item.href)}"${target}${download}`;
}

function renderLink(item, key) {
    if (!item.href) {
        return `<span class="contact-value" data-patch-key="${key}">${escapeHtml(item.value)}</span>`;
    }

    return `<a class="contact-link" data-patch-key="${key}"${getLinkAttributes(item)}>${escapeHtml(item.value)}</a>`;
}

function renderActionLink(action, key) {
    const nextAction = action || {};
    const label = nextAction.label || "";
    const isPrimary = Boolean(nextAction.primary);
    const actionName = nextAction.action ? String(nextAction.action) : "";
    const className = ["hero-action", isPrimary ? "is-primary" : "", !nextAction.href ? "is-disabled" : ""]
        .filter(Boolean)
        .join(" ");
    const actionAttribute = actionName ? ` data-action="${escapeHtml(actionName)}"` : "";

    if (!nextAction.href) {
        return `<span class="${className}" data-patch-key="${key}"${actionAttribute}>${escapeHtml(label)}</span>`;
    }

    return `<a class="${className}" data-patch-key="${key}"${getLinkAttributes(nextAction)}${actionAttribute}>${escapeHtml(label)}</a>`;
}

function getChooser(data) {
    const fallbackChoices = [
        { key: "resume", label: "Resume", copy: "Profile, experience, education and contacts.", path: "#/resume" },
        { key: "blog", label: "Blog", copy: "Notes and posts, ready for future writing.", path: "#/blog" },
        { key: "resources", label: "Resources", copy: "Files, links and GitHub repositories.", path: "#/resources" }
    ];

    return {
        path: "./entrypoint",
        number: "00",
        question: "What brings you here?",
        identity: "",
        prompt: "",
        ...(data.sectionChooser || {}),
        choices: asArray(data.sectionChooser && data.sectionChooser.choices).length
            ? data.sectionChooser.choices
            : fallbackChoices
    };
}

function normalizeView(rawView) {
    return VIEW_KEYS.includes(rawView) ? rawView : "home";
}

function getPanelView(panel) {
    return panel && panel.view ? panel.view : "resume";
}

const panelKindHandlers = {
    text: {
        render(panelKey, panel) {
            return `
                <div class="text-lines">
                    ${asArray(panel.lines)
                        .map((line, lineIndex) => renderTextElement("p", "", `${panelKey}-line-${lineIndex}`, line))
                        .join("")}
                </div>
            `;
        },
        collect(fields, panelKey, panel) {
            asArray(panel.lines).forEach((line, lineIndex) => {
                pushField(fields, `${panelKey}-line-${lineIndex}`, line, panelKey);
            });
        }
    },
    list: {
        render(panelKey, panel) {
            return `
                <ul class="bullet-list">
                    ${asArray(panel.bullets)
                        .map((bullet, bulletIndex) => renderTextElement("li", "", `${panelKey}-bullet-${bulletIndex}`, bullet))
                        .join("")}
                </ul>
            `;
        },
        collect(fields, panelKey, panel) {
            asArray(panel.bullets).forEach((bullet, bulletIndex) => {
                pushField(fields, `${panelKey}-bullet-${bulletIndex}`, bullet, panelKey);
            });
        }
    },
    entries: {
        render(panelKey, panel) {
            return `
                <div class="entry-list">
                    ${asArray(panel.entries)
                        .map((entry, entryIndex) => {
                            const nextEntry = entry || {};

                            return `
                                <article class="entry-card">
                                    ${renderTextElement("p", "entry-eyebrow", `${panelKey}-entry-${entryIndex}-eyebrow`, nextEntry.eyebrow || "")}
                                    ${renderTextElement("h3", "entry-heading", `${panelKey}-entry-${entryIndex}-heading`, nextEntry.heading || "")}
                                    ${renderTextElement("p", "entry-meta", `${panelKey}-entry-${entryIndex}-meta`, nextEntry.meta || "")}
                                    ${renderTextElement("p", "entry-copy", `${panelKey}-entry-${entryIndex}-copy`, nextEntry.copy || "")}
                                    ${nextEntry.href ? renderActionLink(nextEntry, `${panelKey}-entry-${entryIndex}-link`) : ""}
                                </article>
                            `;
                        })
                        .join("")}
                </div>
            `;
        },
        collect(fields, panelKey, panel) {
            asArray(panel.entries).forEach((entry, entryIndex) => {
                const nextEntry = entry || {};

                pushField(fields, `${panelKey}-entry-${entryIndex}-eyebrow`, nextEntry.eyebrow, panelKey);
                pushField(fields, `${panelKey}-entry-${entryIndex}-heading`, nextEntry.heading, panelKey);
                pushField(fields, `${panelKey}-entry-${entryIndex}-meta`, nextEntry.meta, panelKey);
                pushField(fields, `${panelKey}-entry-${entryIndex}-copy`, nextEntry.copy, panelKey);

                if (nextEntry.href) {
                    pushField(fields, `${panelKey}-entry-${entryIndex}-link`, nextEntry.label || "open", panelKey, {
                        href: nextEntry.href || ""
                    });
                }
            });
        }
    },
    contacts: {
        render(panelKey, panel) {
            return `
                <div class="contact-list">
                    ${asArray(panel.items)
                        .map(
                            (item, itemIndex) => `
                                <div class="contact-item">
                                    ${renderTextElement("span", "contact-label", `${panelKey}-contact-${itemIndex}-label`, (item && item.label) || "")}
                                    ${renderLink(item || {}, `${panelKey}-contact-${itemIndex}-value`)}
                                </div>
                            `
                        )
                        .join("")}
                </div>
            `;
        },
        collect(fields, panelKey, panel) {
            asArray(panel.items).forEach((item, itemIndex) => {
                const nextItem = item || {};

                pushField(fields, `${panelKey}-contact-${itemIndex}-label`, nextItem.label, panelKey);
                pushField(fields, `${panelKey}-contact-${itemIndex}-value`, nextItem.value, panelKey, {
                    href: nextItem.href || ""
                });
            });
        }
    }
};

export function createRenderer({ app, summarySectionFallback, getCurrentView }) {
    function resolveView() {
        return normalizeView(typeof getCurrentView === "function" ? getCurrentView() : "home");
    }

    function getSummarySection(data) {
        return {
            ...summarySectionFallback,
            ...(data.summarySection || {})
        };
    }

    function getVisiblePanels(data, view) {
        return asArray(data.panels)
            .map((panel, index) => ({ panel: panel || {}, index }))
            .filter(({ panel }) => getPanelView(panel) === view);
    }

    function getChoiceForView(data, view) {
        const chooser = getChooser(data);
        return chooser.choices.find((choice) => choice.key === view) || chooser.choices[0] || {};
    }

    function renderChooser(data, currentView, isCompact) {
        const chooser = getChooser(data);
        const modifier = isCompact ? " is-compact" : "";
        const sectionAccent = currentView === "home" ? "home" : currentView;

        return `
            <section class="card chooser-card${modifier}" data-patch-group="chooser" data-section-accent="${escapeHtml(sectionAccent)}" style="--card-index: 0;">
                <div class="section-head">
                    ${renderTextElement("span", "section-path", "chooser-path", chooser.path || "./entrypoint")}
                    ${renderTextElement("span", "", "chooser-number", chooser.number || "00")}
                </div>
                ${renderTextElement("h2", "section-title", "chooser-question", chooser.question || "What brings you here?")}
                ${chooser.identity ? renderTextElement("p", "chooser-identity", "chooser-identity", chooser.identity) : ""}
                ${chooser.prompt ? renderTextElement("p", "chooser-prompt", "chooser-prompt", chooser.prompt) : ""}
                <div class="choice-grid">
                    ${chooser.choices
                        .map((choice, index) => {
                            const key = choice.key || `choice-${index}`;
                            const isActive = key === currentView;
                            const isPrimary = key === "resume";
                            const href = choice.path || `#/${key}`;
                            const classNames = ["choice-card", isPrimary ? "is-primary" : "", isActive ? "is-active" : ""]
                                .filter(Boolean)
                                .join(" ");
                            const primaryAttribute = isPrimary ? ' data-primary="true"' : "";
                            const activeAttribute = isActive ? ' aria-current="page"' : "";

                            return `
                                <a class="${classNames}" href="${escapeHtml(href)}"${activeAttribute} data-section-choice="${escapeHtml(key)}" data-section-accent="${escapeHtml(key)}"${primaryAttribute}>
                                    ${renderTextElement("span", "choice-number", `chooser-choice-${index}-number`, choice.number || String(index + 1).padStart(2, "0"))}
                                    ${renderTextElement("strong", "choice-title", `chooser-choice-${index}-label`, choice.label || key)}
                                    ${renderTextElement("span", "choice-copy", `chooser-choice-${index}-copy`, choice.copy || "")}
                                </a>
                            `;
                        })
                        .join("")}
                </div>
            </section>
        `;
    }

    function renderPanel(panel, index, cardIndex) {
        const nextPanel = panel || {};
        const spanAttr = nextPanel.span === "wide" ? ' data-span="wide"' : "";
        const panelKey = `panel-${index}`;
        const handler = panelKindHandlers[nextPanel.kind];
        const body = handler ? handler.render(panelKey, nextPanel) : "";

        return `
            <section class="card" data-patch-group="${panelKey}" style="--card-index: ${cardIndex};"${spanAttr}>
                <div class="section-head">
                    ${renderTextElement("span", "section-path", `${panelKey}-path`, nextPanel.path || "")}
                    <span>${escapeHtml(nextPanel.number || "")}</span>
                </div>
                ${renderTextElement("h2", "section-title", `${panelKey}-title`, nextPanel.title || "")}
                ${body}
            </section>
        `;
    }

    function renderResumeView(data) {
        const hero = data.hero || {};
        const heroTags = asArray(hero.tags);
        const heroActions = asArray(hero.actions);
        const facts = asArray(data.facts);
        const panels = getVisiblePanels(data, "resume");
        const summarySection = getSummarySection(data);

        return `
            <section class="card hero-card" data-patch-group="hero" style="--card-index: 1;">
                <div class="section-head">
                    <span class="section-path">~/resume</span>
                    <span>00</span>
                </div>
                ${renderTextElement("p", "hero-pretitle", "hero-pretitle", hero.pretitle || "")}
                ${renderTextElement("h1", "hero-name", "hero-name", hero.name || "", "tabindex=\"-1\" data-route-heading")}
                ${renderTextElement("p", "hero-title", "hero-title", hero.title || "")}
                ${renderTextElement("p", "hero-summary", "hero-summary", hero.summary || "")}
                <div class="hero-tags">
                    ${heroTags.map((tag, index) => renderTextElement("span", "", `hero-tag-${index}`, tag)).join("")}
                </div>
                <div class="hero-actions">
                    ${heroActions.map((action, index) => renderActionLink(action, `hero-action-${index}`)).join("")}
                </div>
            </section>

            <section class="card facts-card" data-patch-group="facts" style="--card-index: 2;">
                <div class="section-head">
                    ${renderTextElement("span", "section-path", "facts-path", summarySection.path)}
                    <span>${escapeHtml(summarySection.number)}</span>
                </div>
                ${renderTextElement("h2", "section-title", "facts-title", summarySection.title)}
                <ul class="facts-list">
                    ${facts
                        .map(
                            (fact, index) => `
                                <li class="fact-item">
                                    ${renderTextElement("span", "fact-label", `fact-${index}-label`, fact.label || "")}
                                    ${renderTextElement("span", "fact-value", `fact-${index}-value`, fact.value || "")}
                                </li>
                            `
                        )
                        .join("")}
                </ul>
            </section>

            ${panels.map(({ panel, index }, visibleIndex) => renderPanel(panel, index, visibleIndex + 3)).join("")}
        `;
    }

    function renderSectionView(data, view) {
        const choice = getChoiceForView(data, view);
        const panels = getVisiblePanels(data, view);

        return `
            <section class="card view-card" data-patch-group="view-${view}" style="--card-index: 1;">
                <div class="section-head">
                    <span class="section-path">~/${escapeHtml(view)}</span>
                    <span>${escapeHtml(choice.number || "")}</span>
                </div>
                ${renderTextElement("h1", "view-title", `view-${view}-title`, choice.label || view, "tabindex=\"-1\" data-route-heading")}
                ${renderTextElement("p", "view-copy", `view-${view}-copy`, choice.copy || "")}
            </section>
            ${panels.map(({ panel, index }, visibleIndex) => renderPanel(panel, index, visibleIndex + 2)).join("")}
        `;
    }

    function getHomeEnterRevealPayload(data, view) {
        if (view === "resume") {
            const hero = data.hero || {};
            return {
                headingText: hero.name || "",
                copyText: hero.summary || ""
            };
        }

        const choice = getChoiceForView(data, view);
        return {
            headingText: choice.label || view,
            copyText: choice.copy || ""
        };
    }

    function renderViewContent(data, view) {
        return view === "resume" ? renderResumeView(data) : renderSectionView(data, view);
    }

    function renderPageFrame(data, view) {
        return `
            <div class="page-rail-frame" data-page-rail-frame data-page-rail-view="${escapeHtml(view)}">
                <div class="page-rail-stage" data-page-rail-stage data-page-rail-view="${escapeHtml(view)}">
                    ${renderViewContent(data, view)}
                </div>
            </div>
        `;
    }

    function blankPatchText(markup) {
        return String(markup || "").replace(
            /(<(a|h1|h2|h3|li|p|span|strong)\b[^>]*data-patch-key="[^"]+"[^>]*>)[\s\S]*?(<\/\2>)/g,
            "$1$3"
        );
    }

    function renderBlankPatchFrame(data, view) {
        return blankPatchText(renderPageFrame(data, view));
    }

    function renderHomeEnterFrame(data, view, options = {}) {
        if (!app) {
            return;
        }

        const phase = options.phase || "frame";
        const choice = getChoiceForView(data, view);
        const blankPageFrame = renderBlankPatchFrame(data, view);
        const liveRouteAttributes = phase === "content"
            ? ` data-home-enter-live-route data-home-enter-live-view="${escapeHtml(view)}"`
            : "";

        app.innerHTML = `
            <div class="route-root route-root--home-enter" data-current-section="${escapeHtml(view)}" data-section-accent="${escapeHtml(view)}" data-route-transition="home-enter" data-route-phase="${escapeHtml(phase)}" tabindex="-1">
                <div class="home-enter-selection" data-home-enter-selection data-home-enter-view="${escapeHtml(view)}" data-home-enter-phase="${escapeHtml(phase)}">
                    <span class="choice-number">${escapeHtml(choice.number || "")}</span>
                    <strong class="choice-title">${escapeHtml(choice.label || view)}</strong>
                </div>
                <section class="card home-enter-frame-card" data-home-enter-frame data-home-enter-view="${escapeHtml(view)}" data-frame-origin="center" style="--card-index: 1;">
                    <div class="section-head">
                        <span class="section-path">~/${escapeHtml(view)}</span>
                        <span>${escapeHtml(choice.number || "")}</span>
                    </div>
                    <h1 class="section-title home-enter-heading" data-route-heading data-home-enter-field="heading"></h1>
                    <p class="view-copy home-enter-copy" data-home-enter-field="copy"></p>
                </section>
                <div class="home-enter-page-stack" data-home-enter-page-stack data-home-enter-page-view="${escapeHtml(view)}" data-home-enter-phase="${escapeHtml(phase)}">
                    <div class="home-enter-page-surface" data-home-enter-page-surface${liveRouteAttributes} data-home-enter-page-view="${escapeHtml(view)}" data-home-enter-phase="${escapeHtml(phase)}" data-home-enter-outline="true" aria-hidden="true" inert>
                        ${blankPageFrame}
                    </div>
                </div>
            </div>
        `;
    }

    function renderPageRailFrame(data, fromView, toView, options = {}) {
        if (!app) {
            return;
        }

        const phase = options.phase || "exiting";
        const timing = options.timing || {};
        const styleTokens = [];

        if (typeof timing.exitMs === "number") {
            styleTokens.push(`--page-rail-exit-ms: ${timing.exitMs}ms`);
        }

        if (typeof timing.enterMs === "number") {
            styleTokens.push(`--page-rail-enter-ms: ${timing.enterMs}ms`);
        }

        if (typeof timing.travelPx === "number") {
            styleTokens.push(`--page-rail-travel-px: ${timing.travelPx}px`);
        }

        const inlineStyle = styleTokens.length ? ` style="${styleTokens.join("; ")}"` : "";
        const normalizedFromView = normalizeView(fromView);
        const normalizedToView = normalizeView(toView);

        app.innerHTML = `
            <div class="route-root route-root--page-rail" data-current-section="${escapeHtml(normalizedToView)}" data-section-accent="${escapeHtml(normalizedToView)}" data-route-transition="page-rail" data-route-phase="${escapeHtml(phase)}" tabindex="-1">
                <div class="page-rail-frame" data-page-rail-frame data-page-rail-view="${escapeHtml(normalizedToView)}"${inlineStyle}>
                    <div class="page-rail-stage page-rail-stage--transition" data-page-rail-stage data-rail-axis="x">
                        <div class="page-rail-page page-rail-page--from" data-page-rail-page="from" data-page-rail-view="${escapeHtml(normalizedFromView)}" aria-hidden="true">
                            ${renderViewContent(data, normalizedFromView)}
                        </div>
                        <div class="page-rail-page page-rail-page--to" data-page-rail-page="to" data-page-rail-view="${escapeHtml(normalizedToView)}">
                            ${renderViewContent(data, normalizedToView)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderApp(data, options = {}) {
        if (!app) {
            return;
        }

        const view = normalizeView(options.viewOverride || resolveView());

        if (typeof app.setAttribute === "function") {
            app.setAttribute("data-current-section", view);
            app.setAttribute("data-section-accent", view);
        }

        if (view === "home") {
            app.innerHTML = `
                <div class="route-root route-root--home" data-current-section="home" data-section-accent="home" tabindex="-1"></div>
            `;
            return;
        }

        app.innerHTML = `
            <div class="route-root" data-current-section="${escapeHtml(view)}" data-section-accent="${escapeHtml(view)}" tabindex="-1">
                ${renderPageFrame(data, view)}
            </div>
        `;
    }

    function collectChooserFields(fields, data) {
        const chooser = getChooser(data);

        pushField(fields, "chooser-path", chooser.path, "chooser");
        pushField(fields, "chooser-number", chooser.number, "chooser");
        pushField(fields, "chooser-question", chooser.question, "chooser");

        if (chooser.identity) {
            pushField(fields, "chooser-identity", chooser.identity, "chooser");
        }

        if (chooser.prompt) {
            pushField(fields, "chooser-prompt", chooser.prompt, "chooser");
        }

        chooser.choices.forEach((choice, index) => {
            pushField(fields, `chooser-choice-${index}-number`, choice.number, "chooser");
            pushField(fields, `chooser-choice-${index}-label`, choice.label, "chooser");
            pushField(fields, `chooser-choice-${index}-copy`, choice.copy, "chooser");
        });
    }

    function collectPanelFields(fields, panel, index) {
        const nextPanel = panel || {};
        const panelKey = `panel-${index}`;
        const handler = panelKindHandlers[nextPanel.kind];

        pushField(fields, `${panelKey}-path`, nextPanel.path, panelKey);
        pushField(fields, `${panelKey}-title`, nextPanel.title, panelKey);

        if (handler) {
            handler.collect(fields, panelKey, nextPanel);
        }
    }

    function collectResumeFields(fields, data) {
        const hero = data.hero || {};
        const heroTags = asArray(hero.tags);
        const heroActions = asArray(hero.actions);
        const facts = asArray(data.facts);
        const summarySection = getSummarySection(data);

        pushField(fields, "hero-pretitle", hero.pretitle, "hero");
        pushField(fields, "hero-name", hero.name, "hero");
        pushField(fields, "hero-title", hero.title, "hero");
        pushField(fields, "hero-summary", hero.summary, "hero");

        heroTags.forEach((tag, index) => {
            pushField(fields, `hero-tag-${index}`, tag, "hero");
        });

        heroActions.forEach((action, index) => {
            const nextAction = action || {};
            pushField(fields, `hero-action-${index}`, nextAction.label, "hero", {
                href: nextAction.href || ""
            });
        });

        pushField(fields, "facts-path", summarySection.path, "facts");
        pushField(fields, "facts-title", summarySection.title, "facts");

        facts.forEach((fact, index) => {
            pushField(fields, `fact-${index}-label`, fact.label, "facts");
            pushField(fields, `fact-${index}-value`, fact.value, "facts");
        });
    }

    function collectSectionHeaderFields(fields, data, view) {
        const choice = getChoiceForView(data, view);

        pushField(fields, `view-${view}-title`, choice.label, `view-${view}`);
        pushField(fields, `view-${view}-copy`, choice.copy, `view-${view}`);
    }

    function buildRenderableFields(data) {
        const view = resolveView();
        const fields = [];

        if (view === "home") {
            return fields;
        }

        if (view === "resume") {
            collectResumeFields(fields, data);
        } else {
            collectSectionHeaderFields(fields, data, view);
        }

        getVisiblePanels(data, view).forEach(({ panel, index }) => {
            collectPanelFields(fields, panel, index);
        });

        return fields;
    }

    function setGroupPatchState(groupName, isActive) {
        if (!app) {
            return;
        }

        const groupSelectors = {
            hero: ".hero-card",
            facts: ".facts-card",
            chooser: ".chooser-card"
        };
        const selector = groupSelectors[groupName] || `[data-patch-group="${groupName}"]`;
        const target = app.querySelector(selector);

        if (target) {
            target.classList.toggle("is-patching-section", isActive);
        }
    }

    function renderContentError(error) {
        if (!app) {
            return;
        }

        const details = error && error.message ? error.message : "data/published.json could not be loaded.";

        app.innerHTML = `
            <section class="card content-error-card" data-patch-group="content-error" style="--card-index: 1;">
                <div class="section-head">
                    <span class="section-path">./content</span>
                    <span>ERR</span>
                </div>
                <h1 class="section-title">contenuto pubblico non disponibile / published content unavailable</h1>
                <p class="content-error-copy">Non posso caricare il contenuto pubblicato in modo sicuro. I can still be reached directly by email.</p>
                <p class="content-error-detail">${escapeHtml(details)}</p>
                <a class="contact-link content-error-link" href="mailto:${PUBLIC_CONTACT_EMAIL}">${PUBLIC_CONTACT_EMAIL}</a>
            </section>
        `;
    }

    return {
        renderApp,
        renderHomeEnterFrame,
        renderPageRailFrame,
        renderContentError,
        buildRenderableFields,
        getHomeEnterRevealPayload,
        setGroupPatchState
    };
}
