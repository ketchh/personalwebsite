// Seed/fallback content retained for local maintenance; the public app reads data/published.json.
// Struttura evoluta dal prototipo originale: terminale, bilingue, statico, senza build step.
window.PORTFOLIO_CONTENT = {
    "defaultLanguage": "it",
    "introSite": {
        "greeting": "hello",
        "wordsList": [
            " world", " anon", " user", " stranger", " admin",
            " system", " friend", " guest", " entity",
            " neo", " pilot", " ghost", " shell"
        ]
    },
    "languages": {
        "it": {
            "htmlLang": "it",
            "ui": {
                "introHint": "Cosa ti porta qui?",
                "heroCommand": "",
                "patchSelectorLabel": "patch mode",
                "patchDirectionLabel": "direction",
                "patchSpeedLabel": "speed",
                "patchGranularity": {
                    "line": {
                        "short": "riga",
                        "long": "riga per riga"
                    },
                    "word": {
                        "short": "word",
                        "long": "word by word"
                    },
                    "char": {
                        "short": "lettera",
                        "long": "lettera per lettera"
                    }
                },
                "patchDirection": {
                    "forward": {
                        "short": "normale",
                        "long": "dall'inizio alla fine"
                    },
                    "reverse": {
                        "short": "reverse",
                        "long": "from end to start"
                    }
                },
                "patchSpeedPresets": {
                    "1": {
                        "short": "rapida",
                        "long": "piu veloce"
                    },
                    "2": {
                        "short": "normale",
                        "long": "velocita normale"
                    },
                    "3": {
                        "short": "slow",
                        "long": "slower"
                    },
                    "4": {
                        "short": "molto lenta",
                        "long": "molto piu lenta"
                    }
                },
                "statusLeft": "[F1] resume [F2] blog [F3] resources",
                "statusRight": "translation::ready"
            },
            "summarySection": {
                "path": "./summary",
                "number": "01",
                "title": "Summary"
            },
            "hero": {
                "pretitle": "hello, this is",
                "name": "Alessandro Sbarsi",
                "title": "Codice chiaro per sistemi complessi, performance e conoscenza aperta.",
                "summary": "Milano, Lombardia. Studente di Ingegneria Informatica al Politecnico di Milano e sviluppatore presso Aly Service: progetto codice leggero e documentato per Odoo, automazione dei processi e trasformazione digitale, condividendo risorse utili con concretezza.",
                "tags": [
                    "Milano",
                    "Ingegneria Informatica",
                    "Odoo",
                    "Git",
                    "Project Management"
                ],
                "actions": [
                    {
                        "label": "alessandro@sbar.si",
                        "href": "mailto:alessandro@sbar.si",
                        "action": "email",
                        "primary": true
                    },
                    {
                        "label": "Scarica resume PDF",
                        "href": "./files/alessandro-sbarsi-resume.pdf",
                        "download": true
                    },
                    {
                        "label": "LinkedIn",
                        "href": "https://www.linkedin.com/in/alessandro-sbarsi/"
                    },
                    {
                        "label": "GitHub",
                        "href": "https://github.com/ketchh"
                    }
                ]
            },
            "facts": [
                {
                    "label": "Base",
                    "value": "Milano, Lombardia, Italia"
                },
                {
                    "label": "Formazione",
                    "value": "Laurea triennale in Ingegneria Informatica / Politecnico di Milano"
                },
                {
                    "label": "Esperienza attuale",
                    "value": "Aly Service / Sviluppatore / apr 2024 - presente"
                },
                {
                    "label": "Contatti",
                    "value": "alessandro@sbar.si / github.com/ketchh"
                }
            ],
            "panels": [
                {
                    "number": "02",
                    "path": "./experience",
                    "title": "Experience",
                    "kind": "entries",
                    "span": "wide",
                    "view": "resume",
                    "entries": [
                        {
                            "eyebrow": "current",
                            "heading": "Aly Service",
                            "meta": "aprile 2024 - Present / Sviluppatore / Milano",
                            "copy": "Sviluppo e implementazione di soluzioni Odoo customizzate, mirate all'automazione e all'ottimizzazione dei processi di business. Ruolo chiave nel guidare l'azienda attraverso una transizione tecnologica strategica, favorendo la trasformazione digitale."
                        },
                        {
                            "eyebrow": "previous",
                            "heading": "Al Confine",
                            "meta": "novembre 2022 - aprile 2024 / Cameriere / Bartender / Milano",
                            "copy": "Esperienza in sala e banco bar in un contesto a contatto con il pubblico, con focus su servizio al cliente, ritmo operativo, collaborazione con il team e qualita dell'esperienza."
                        },
                        {
                            "eyebrow": "founding",
                            "heading": "Onetap",
                            "meta": "giugno 2021 - febbraio 2022 / Founding Member / Milano, Lombardia",
                            "copy": "Partecipazione alla fondazione del progetto Onetap, contribuendo alla fase iniziale di definizione, sviluppo e organizzazione del lavoro."
                        },
                        {
                            "eyebrow": "developer",
                            "heading": "Onetap",
                            "meta": "giugno 2021 - febbraio 2022 / Developer",
                            "copy": "Esperienza di sviluppo collegata al progetto Onetap, maturata parallelamente al ruolo di founding member."
                        }
                    ]
                },
                {
                    "number": "03",
                    "path": "./education",
                    "title": "Education",
                    "kind": "entries",
                    "view": "resume",
                    "entries": [
                        {
                            "eyebrow": "ongoing",
                            "heading": "Politecnico di Milano",
                            "meta": "settembre 2023 - dicembre 2028 / Laurea triennale, Ingegneria informatica",
                            "copy": "Percorso universitario in Ingegneria Informatica con focus su basi tecniche, progettazione di algoritmi, metodo ingegneristico e problem solving."
                        },
                        {
                            "eyebrow": "school",
                            "heading": "Liceo Classico Cesare Beccaria",
                            "meta": "gennaio 2016 - giugno 2023 / Studente",
                            "copy": "Percorso liceale classico completato prima dell'ingresso al Politecnico di Milano."
                        }
                    ]
                },
                {
                    "number": "04",
                    "path": "./skills",
                    "title": "Core skills",
                    "kind": "list",
                    "view": "resume",
                    "bullets": [
                        "Progettazione di algoritmi.",
                        "Git e gestione del lavoro su codice.",
                        "Project Management.",
                        "Sviluppo e customizzazione Odoo per automazione dei processi di business."
                    ]
                },
                {
                    "number": "05",
                    "path": "./languages",
                    "title": "Languages",
                    "kind": "list",
                    "view": "resume",
                    "bullets": [
                        "Italiano — Native or Bilingual.",
                        "Inglese — Full Professional.",
                        "Francese — Limited Working."
                    ]
                },
                {
                    "number": "06",
                    "path": "./blog",
                    "title": "Blog",
                    "kind": "entries",
                    "view": "blog",
                    "entries": [
                        {
                            "eyebrow": "draft area",
                            "heading": "Nessun post pubblicato per ora",
                            "meta": "content.js ready / static blog slot",
                            "copy": "La sezione blog e pronta dentro la struttura originale: quando vuoi pubblicare davvero, aggiungiamo post come entry oppure una pagina dedicata mantenendo la stessa estetica terminale."
                        }
                    ]
                },
                {
                    "number": "07",
                    "path": "./resources",
                    "title": "Resources / Repo",
                    "kind": "contacts",
                    "span": "wide",
                    "view": "resources",
                    "items": [
                        {
                            "label": "GitHub",
                            "value": "github.com/ketchh",
                            "href": "https://github.com/ketchh"
                        },
                        {
                            "label": "Resume PDF",
                            "value": "alessandro-sbarsi-resume.pdf",
                            "href": "./files/alessandro-sbarsi-resume.pdf",
                            "download": true
                        },
                        {
                            "label": "LinkedIn",
                            "value": "linkedin.com/in/alessandro-sbarsi",
                            "href": "https://www.linkedin.com/in/alessandro-sbarsi/"
                        },
                        {
                            "label": "File drop",
                            "value": "./files/",
                            "href": "./files/README.txt"
                        }
                    ]
                },
                {
                    "number": "08",
                    "path": "./contacts",
                    "title": "Contacts",
                    "kind": "contacts",
                    "view": "resume",
                    "items": [
                        {
                            "label": "Email",
                            "value": "alessandro@sbar.si",
                            "href": "mailto:alessandro@sbar.si"
                        },
                        {
                            "label": "LinkedIn",
                            "value": "alessandro-sbarsi",
                            "href": "https://www.linkedin.com/in/alessandro-sbarsi/"
                        },
                        {
                            "label": "GitHub",
                            "value": "github.com/ketchh",
                            "href": "https://github.com/ketchh"
                        },
                        {
                            "label": "Sito",
                            "value": "sbar.si",
                            "href": "https://sbar.si"
                        }
                    ]
                }
            ],
            "sectionChooser": {
                "path": "./entrypoint",
                "number": "00",
                "question": "Cosa ti porta qui?",
                "identity": "",
                "prompt": "",
                "choices": [
                    {
                        "key": "resume",
                        "number": "01",
                        "label": "Curriculum",
                        "copy": "CV, esperienze, formazione, contatti e PDF scaricabile.",
                        "path": "#/resume"
                    },
                    {
                        "key": "blog",
                        "number": "02",
                        "label": "Blog",
                        "copy": "Spazio pronto per post e appunti pubblici, ancora vuoto.",
                        "path": "#/blog"
                    },
                    {
                        "key": "resources",
                        "number": "03",
                        "label": "Risorse",
                        "copy": "GitHub, file locali, PDF e risorse da linkare.",
                        "path": "#/resources"
                    }
                ]
            }
        },
        "en": {
            "htmlLang": "en",
            "ui": {
                "introHint": "What brings you here?",
                "heroCommand": "",
                "patchSelectorLabel": "patch mode",
                "patchDirectionLabel": "direction",
                "patchSpeedLabel": "speed",
                "patchGranularity": {
                    "line": {
                        "short": "line",
                        "long": "line by line"
                    },
                    "word": {
                        "short": "word",
                        "long": "word by word"
                    },
                    "char": {
                        "short": "char",
                        "long": "letter by letter"
                    }
                },
                "patchDirection": {
                    "forward": {
                        "short": "forward",
                        "long": "from start to end"
                    },
                    "reverse": {
                        "short": "reverse",
                        "long": "from end to start"
                    }
                },
                "patchSpeedPresets": {
                    "1": {
                        "short": "fast",
                        "long": "faster"
                    },
                    "2": {
                        "short": "normal",
                        "long": "normal speed"
                    },
                    "3": {
                        "short": "slow",
                        "long": "slower"
                    },
                    "4": {
                        "short": "very slow",
                        "long": "much slower"
                    }
                },
                "statusLeft": "[F1] resume [F2] blog [F3] resources",
                "statusRight": "translation::ready"
            },
            "summarySection": {
                "path": "./summary",
                "number": "01",
                "title": "Summary"
            },
            "hero": {
                "pretitle": "hello, this is",
                "name": "Alessandro Sbarsi",
                "title": "Clear code for complex systems, performance, and open knowledge.",
                "summary": "Milan, Lombardy. Computer Engineering student at Politecnico di Milano and Developer at Aly Service: I build lightweight, documented code for Odoo, process automation, and digital transformation while sharing useful resources with concrete communication.",
                "tags": [
                    "Milan",
                    "Computer Engineering",
                    "Odoo",
                    "Git",
                    "Project Management"
                ],
                "actions": [
                    {
                        "label": "alessandro@sbar.si",
                        "href": "mailto:alessandro@sbar.si",
                        "action": "email",
                        "primary": true
                    },
                    {
                        "label": "Download resume PDF",
                        "href": "./files/alessandro-sbarsi-resume.pdf",
                        "download": true
                    },
                    {
                        "label": "LinkedIn",
                        "href": "https://www.linkedin.com/in/alessandro-sbarsi/"
                    },
                    {
                        "label": "GitHub",
                        "href": "https://github.com/ketchh"
                    }
                ]
            },
            "facts": [
                {
                    "label": "Base",
                    "value": "Milan, Lombardy, Italy"
                },
                {
                    "label": "Education",
                    "value": "Bachelor's degree in Computer Engineering / Politecnico di Milano"
                },
                {
                    "label": "Current experience",
                    "value": "Aly Service / Developer / Apr 2024 - present"
                },
                {
                    "label": "Contacts",
                    "value": "alessandro@sbar.si / github.com/ketchh"
                }
            ],
            "panels": [
                {
                    "number": "02",
                    "path": "./experience",
                    "title": "Experience",
                    "kind": "entries",
                    "span": "wide",
                    "view": "resume",
                    "entries": [
                        {
                            "eyebrow": "current",
                            "heading": "Aly Service",
                            "meta": "April 2024 - Present / Developer / Milan",
                            "copy": "Development and implementation of customized Odoo solutions aimed at automating and optimizing business processes. Key role in guiding the company through a strategic technological transition, supporting digital transformation."
                        },
                        {
                            "eyebrow": "previous",
                            "heading": "Al Confine",
                            "meta": "November 2022 - April 2024 / Waiter / Bartender / Milan",
                            "copy": "Front-of-house and bar experience in a people-facing environment, focused on customer service, operational rhythm, teamwork, and quality of the guest experience."
                        },
                        {
                            "eyebrow": "founding",
                            "heading": "Onetap",
                            "meta": "June 2021 - February 2022 / Founding Member / Milan, Lombardy",
                            "copy": "Participated in founding the Onetap project, contributing to the early definition, development, and organization of the work."
                        },
                        {
                            "eyebrow": "developer",
                            "heading": "Onetap",
                            "meta": "June 2021 - February 2022 / Developer",
                            "copy": "Development experience connected to the Onetap project, gained alongside the founding member role."
                        }
                    ]
                },
                {
                    "number": "03",
                    "path": "./education",
                    "title": "Education",
                    "kind": "entries",
                    "view": "resume",
                    "entries": [
                        {
                            "eyebrow": "ongoing",
                            "heading": "Politecnico di Milano",
                            "meta": "September 2023 - December 2028 / Bachelor's degree, Computer Engineering",
                            "copy": "University path in Computer Engineering focused on technical foundations, algorithm design, engineering method, and problem solving."
                        },
                        {
                            "eyebrow": "school",
                            "heading": "Liceo Classico Cesare Beccaria",
                            "meta": "January 2016 - June 2023 / Student",
                            "copy": "Classical high school path completed before entering Politecnico di Milano."
                        }
                    ]
                },
                {
                    "number": "04",
                    "path": "./skills",
                    "title": "Core skills",
                    "kind": "list",
                    "view": "resume",
                    "bullets": [
                        "Algorithm design.",
                        "Git and code workflow management.",
                        "Project Management.",
                        "Odoo development and customization for business process automation."
                    ]
                },
                {
                    "number": "05",
                    "path": "./languages",
                    "title": "Languages",
                    "kind": "list",
                    "view": "resume",
                    "bullets": [
                        "Italian — Native or Bilingual.",
                        "English — Full Professional.",
                        "French — Limited Working."
                    ]
                },
                {
                    "number": "06",
                    "path": "./blog",
                    "title": "Blog",
                    "kind": "entries",
                    "view": "blog",
                    "entries": [
                        {
                            "eyebrow": "draft area",
                            "heading": "No posts published yet",
                            "meta": "content.js ready / static blog slot",
                            "copy": "The blog section is ready inside the original architecture: when you want to publish for real, we can add posts as entries or a dedicated page while preserving the same terminal aesthetic."
                        }
                    ]
                },
                {
                    "number": "07",
                    "path": "./resources",
                    "title": "Resources / Repos",
                    "kind": "contacts",
                    "span": "wide",
                    "view": "resources",
                    "items": [
                        {
                            "label": "GitHub",
                            "value": "github.com/ketchh",
                            "href": "https://github.com/ketchh"
                        },
                        {
                            "label": "Resume PDF",
                            "value": "alessandro-sbarsi-resume.pdf",
                            "href": "./files/alessandro-sbarsi-resume.pdf",
                            "download": true
                        },
                        {
                            "label": "LinkedIn",
                            "value": "linkedin.com/in/alessandro-sbarsi",
                            "href": "https://www.linkedin.com/in/alessandro-sbarsi/"
                        },
                        {
                            "label": "File drop",
                            "value": "./files/",
                            "href": "./files/README.txt"
                        }
                    ]
                },
                {
                    "number": "08",
                    "path": "./contacts",
                    "title": "Contacts",
                    "kind": "contacts",
                    "view": "resume",
                    "items": [
                        {
                            "label": "Email",
                            "value": "alessandro@sbar.si",
                            "href": "mailto:alessandro@sbar.si"
                        },
                        {
                            "label": "LinkedIn",
                            "value": "alessandro-sbarsi",
                            "href": "https://www.linkedin.com/in/alessandro-sbarsi/"
                        },
                        {
                            "label": "GitHub",
                            "value": "github.com/ketchh",
                            "href": "https://github.com/ketchh"
                        },
                        {
                            "label": "Website",
                            "value": "sbar.si",
                            "href": "https://sbar.si"
                        }
                    ]
                }
            ],
            "sectionChooser": {
                "path": "./entrypoint",
                "number": "00",
                "question": "What brings you here?",
                "identity": "",
                "prompt": "",
                "choices": [
                    {
                        "key": "resume",
                        "number": "01",
                        "label": "Resume",
                        "copy": "CV, experience, education, contacts, and downloadable PDF.",
                        "path": "#/resume"
                    },
                    {
                        "key": "blog",
                        "number": "02",
                        "label": "Blog",
                        "copy": "A ready space for public posts and notes, still empty.",
                        "path": "#/blog"
                    },
                    {
                        "key": "resources",
                        "number": "03",
                        "label": "Resources",
                        "copy": "GitHub, local files, PDF, and resources to link.",
                        "path": "#/resources"
                    }
                ]
            }
        }
    }
};
