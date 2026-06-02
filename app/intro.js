import { wait } from "./shared.js";

export function createIntroController({ refs, introConfig }) {
    const prefix = refs.prefix;
    const typingArea = refs.typingArea;
    const hint = refs.hint;
    const choices = refs.choices;

    let introRevealTimerId = 0;
    let introHintTimerId = 0;
    let introChoicesTimerId = 0;
    let introTypingTimerId = 0;
    let isBound = false;

    function getChoiceLinks() {
        if (!choices || typeof choices.querySelectorAll !== "function") {
            return [];
        }

        return Array.from(choices.querySelectorAll("[data-section-choice]"));
    }

    function updateUi(ui) {
        const nextUi = ui || {};

        if (hint) {
            hint.textContent = nextUi.introHint || "What brings you here?";
        }

        if (Array.isArray(nextUi.sectionChoices)) {
            const choiceByKey = new Map(nextUi.sectionChoices.map((choice) => [choice && choice.key, choice || {}]));

            getChoiceLinks().forEach((link) => {
                const key = link && link.dataset ? link.dataset.sectionChoice : "";
                const choice = choiceByKey.get(key);
                const label = link && typeof link.querySelector === "function" ? link.querySelector("strong") : null;

                if (choice && label) {
                    label.textContent = choice.label || label.textContent;
                }
            });
        }
    }

    async function animateTextContent(element, nextText, stepDelay) {
        if (!element) {
            return;
        }

        const targetText = String(nextText || "");
        const delay = Math.max(1, Number(stepDelay) || 1);

        if (!targetText) {
            element.textContent = "";
            return;
        }

        for (let index = 1; index <= targetText.length; index += 1) {
            element.textContent = targetText.slice(0, index);
            await wait(delay);
        }
    }

    async function runBrowserEntryPatch(options = {}) {
        const nextOptions = options || {};
        const fromUi = nextOptions.fromUi || {};
        const toUi = nextOptions.toUi || {};
        const timing = nextOptions.timing || {};
        const homeCharDelayMs = Math.max(1, Number(timing.homeCharDelayMs) || 1);
        const choiceStaggerMs = Math.max(0, Number(timing.choiceStaggerMs) || 0);

        revealIntroNow();
        updateUi(fromUi);

        const choiceByKey = new Map(((toUi.sectionChoices && Array.isArray(toUi.sectionChoices)) ? toUi.sectionChoices : []).map((choice) => [choice && choice.key, choice || {}]));
        const tasks = [];

        if (hint) {
            tasks.push(animateTextContent(hint, toUi.introHint || fromUi.introHint || hint.textContent, homeCharDelayMs));
        }

        getChoiceLinks().forEach((link, index) => {
            const key = link && link.dataset ? link.dataset.sectionChoice : "";
            const targetChoice = choiceByKey.get(key);
            const label = link && typeof link.querySelector === "function" ? link.querySelector("strong") : null;

            if (!label || !targetChoice) {
                return;
            }

            const task = wait(index * choiceStaggerMs).then(() =>
                animateTextContent(label, targetChoice.label || label.textContent, homeCharDelayMs)
            );

            tasks.push(task);
        });

        await Promise.all(tasks);
    }

    function prefersReducedMotion() {
        return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function showIntroFrame() {
        showIntroChoices();
    }

    function showIntroHint() {
        if (hint) {
            hint.classList.add("is-visible");
        }
    }

    function showIntroChoices() {
        if (choices) {
            choices.classList.add("is-visible");
        }
    }

    function revealIntroNow() {
        window.clearTimeout(introRevealTimerId);
        window.clearTimeout(introHintTimerId);
        window.clearTimeout(introChoicesTimerId);
        showIntroHint();
        showIntroChoices();
        showIntroFrame();
    }

    function pickIntroWord(currentWord) {
        const pool = introConfig.wordsList;
        let nextWord = pool[Math.floor(Math.random() * pool.length)];

        while (pool.length > 1 && nextWord === currentWord) {
            nextWord = pool[Math.floor(Math.random() * pool.length)];
        }

        return nextWord;
    }

    function initTyping() {
        if (!prefix || !typingArea) {
            return;
        }

        let charIndex = 0;
        let isDeleting = false;
        let currentWord = "";

        prefix.textContent = introConfig.greeting;
        typingArea.textContent = "";

        if (prefersReducedMotion()) {
            typingArea.textContent = introConfig.wordsList[0] || "";
            return;
        }

        function typeLoop() {
            if (!currentWord) {
                currentWord = pickIntroWord(currentWord);
            }

            typingArea.textContent = currentWord.substring(0, charIndex);

            let nextDelay = isDeleting ? introConfig.deletingSpeed : introConfig.typingSpeed;

            if (!isDeleting && charIndex < currentWord.length) {
                charIndex += 1;
            } else if (isDeleting && charIndex > 0) {
                charIndex -= 1;
            } else if (!isDeleting && charIndex === currentWord.length) {
                nextDelay = introConfig.pauseTime;
                isDeleting = true;
            } else {
                isDeleting = false;
                currentWord = pickIntroWord(currentWord);
                nextDelay = introConfig.restartDelay;
            }

            introTypingTimerId = window.setTimeout(typeLoop, nextDelay);
        }

        window.clearTimeout(introTypingTimerId);
        introTypingTimerId = window.setTimeout(typeLoop, introConfig.initialDelay);
    }

    function bindIntroReveal() {
        if (isBound) {
            return;
        }

        isBound = true;

        window.addEventListener("scroll", revealIntroNow, { passive: true });
        window.addEventListener("wheel", revealIntroNow, { passive: true });
        window.addEventListener("touchmove", revealIntroNow, { passive: true });
        window.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
                revealIntroNow();
            }
        });
    }

    function initRevealTimers() {
        window.clearTimeout(introRevealTimerId);
        window.clearTimeout(introHintTimerId);
        window.clearTimeout(introChoicesTimerId);

        if (prefersReducedMotion()) {
            revealIntroNow();
            return;
        }

        introRevealTimerId = window.setTimeout(showIntroFrame, introConfig.arrowRevealDelay);
        introHintTimerId = window.setTimeout(showIntroHint, introConfig.hintRevealDelay);
        introChoicesTimerId = window.setTimeout(showIntroChoices, introConfig.choicesRevealDelay || introConfig.hintRevealDelay);
    }

    function init() {
        initTyping();
        initRevealTimers();
        bindIntroReveal();
    }

    return {
        init,
        updateUi,
        revealIntroNow,
        runBrowserEntryPatch
    };
}
