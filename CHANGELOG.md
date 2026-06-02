# Changelog

All notable changes to `sbar.si` are documented here.

## [0.18.9] - 2026-06-01

### Fixed

- Fixed Home → page arrival so the destination outline surface occupies the viewport immediately after Home clears instead of being pushed below a temporary frame.
- Fixed the staged Home → page handoff so the same outline surface is promoted for text patching, preventing duplicate/ghost page surfaces and outline animation resets.
- Fixed Resume staging so hero and summary card geometry stays stable while text fills progressively from empty.

### Changed

- Kept the Home intro/choice behavior, reduced-motion direct landing, public hashes, page-to-page rail behavior, browser-language entry, published-only public reads, and admin boundaries unchanged.

### Semver

- Patch release: this corrects visual defects in the existing public Home-to-page animation without adding routes, content workflows, publishing behavior, or admin surface area.

## [0.18.8] - 2026-06-01

### Fixed

- Fixed Home → page arrival so `Resume`, `Blog`, and `Resources` now show destination card outlines before destination text appears.
- Fixed the staged Home → page content reveal so destination text fills progressively from empty patch fields instead of mounting the full page copy before the animation can be perceived.
- Fixed the visual handoff so the first readable page state no longer masks the outline build with already-rendered content.

### Changed

- Kept the existing Home intro/choice behavior, reduced-motion direct landing, public hashes, page-to-page rail behavior, browser-language entry, published-only public reads, and admin boundaries unchanged.

### Semver

- Patch release: this refines the existing public Home-to-page animation staging without adding routes, content workflows, publishing behavior, or admin surface area.

## [0.18.7] - 2026-05-31

### Fixed

- Fixed Home → page arrival so the staged Resume/Blog/Resources surface is painted in the viewport during `frame` and `content` instead of being pushed below the fold by the withdrawn Home intro.
- Fixed the final Home → page handoff so the live destination route occupies the same visible position before `idle`, preventing the page from popping into place after the staged build.
- Fixed the withdrawn Home intro controls so they are hidden from keyboard and accessibility reach while destination controls are mounted during the active transition.

### Changed

- Kept reduced-motion direct landing, public hashes, page-to-page rail behavior, browser-language entry, published-only public reads, and admin boundaries unchanged.

### Semver

- Patch release: this corrects the paint/layout and accessibility behavior of an existing public Home-to-page transition without adding routes, content workflows, publishing behavior, or admin surface area.

## [0.18.6] - 2026-05-30

### Fixed

- Fixed Home → page arrival so the shell and destination frame can start entering while the visible section still stays on Home, instead of switching the stable destination chrome/current-link state too early.
- Fixed Home → `Resume|Blog|Resources` so the stable destination chrome now settles at `content`, after the page ingress has already started, instead of reading like “link first, page later.”
- Fixed the withheld Home → page top chrome so it is removed from keyboard tab order while hidden, preventing invisible nav/language controls from remaining focusable during the staged ingress.

### Changed

- Kept reduced-motion direct landing, page-to-page rail behavior, browser-language entry, published-only public reads, and admin boundaries unchanged.

### Semver

- Patch release: this hardens the existing public Home-to-page timing and accessibility behavior without adding new routes, new publishing behavior, or new admin surface area.

## [0.18.5] - 2026-05-30

### Fixed

- Fixed Home → page transitions so the staged destination preview now hands off into a live route continuity layer during `content` instead of ending with a final full-page pop-in.
- Fixed Home → `Resume|Blog|Resources` so the last arrival step uses the same deterministic live-route continuity path instead of feeling harsher on longer destinations like Resume.
- Fixed the final destination introduction so the live page inherits the centered TUI page-build grammar before `idle` instead of appearing all at once after copy patch completion.

### Changed

- Kept reduced-motion direct landing, page-to-page rail behavior, browser-language entry, published-only public reads, public contact/footer polish, and admin boundaries unchanged.

### Semver

- Patch release: this hardens the existing public Home-to-page transition without adding new routes, new publishing behavior, or new admin surface area.

## [0.18.4] - 2026-05-30

### Fixed

- Fixed Home → page arrival so the lingering `Hello ...` intro line and blinking cursor withdraw once the destination page build begins instead of masking the transition.
- Fixed Home → `Resume|Blog|Resources` so the destination preview becomes materially readable at `frame` time instead of feeling like a hidden wait followed by an abrupt pop-in.
- Fixed the active Home → page build so the destination page becomes the primary visible feedback surface earlier without changing reduced-motion direct landing or page-to-page rail behavior.

### Changed

- Kept reduced-motion direct landing, page-to-page rail behavior, browser-language entry, published-only reads, public contact/footer polish, and admin boundaries unchanged.

### Semver

- Patch release: this hardens the existing public Home-to-page animation without adding new routes, new publishing behavior, or new admin surface area.

## [0.18.3] - 2026-05-30

### Fixed

- Fixed Home → page arrival so the destination page preview starts entering on the shared handoff lifecycle instead of popping in late after destination-specific copy timing.
- Fixed the Home → page transition preview so its temporary destination surface stays `inert` while `aria-hidden`, preventing duplicate hidden links from entering keyboard tab order before the final route render.
- Fixed recruiter-facing public contact surfaces so the Resume hero, contacts panel, and published manifest now use `alessandro@sbar.si` with matching `mailto:` links.
- Fixed Resume summary facts and public contact rows so labels stack above values and long strings wrap inside the card instead of overflowing side-by-side metadata columns.
- Fixed the public shell so the visible footer/status strip no longer shows `[F1] resume [F2] blog [F3] resources` or `translation::ready / reverse / word / slow`.

### Changed

- Kept reduced-motion direct landing, `#/resume|#/blog|#/resources`, published-only public reads, language popup/live-status behavior, and admin boundaries unchanged.

### Semver

- Patch release: this polishes and hardens existing public-shell behavior without adding new routes, new publishing capability, or new admin surface area.

## [0.18.2] - 2026-05-30

### Fixed

- Fixed Home `#/` so the public page chrome no longer appears above the intro hub; recruiters now see only the opening question and the three section choices on the landing surface.
- Fixed first-paint routing so direct loads to `#/resume`, `#/blog`, and `#/resources` still show the normal public chrome instead of inheriting the Home-only hidden shell.
- Fixed the Home → page handoff so the selected Home choice stays perceptually present until the destination frame and public page chrome arrive together instead of dropping into a blank pause.
- Fixed reduced-motion Home choice activation so `#/resume`, `#/blog`, and `#/resources` land directly on the destination page without staged handoff lifecycle artifacts.

### Changed

- Kept page-to-page rail behavior, browser-language entry, published-only public reads, and admin boundaries unchanged.

### Semver

- Patch release: this completes and hardens an existing public Home-to-page flow without adding new routes, new publishing behavior, or new admin surface area.

## [0.18.1] - 2026-05-30

### Fixed

- Fixed public `#/resume`, `#/blog`, and `#/resources` so inner pages no longer repeat the Home chooser/dashboard block above the selected section content.
- Fixed the second-row nav under `sbar.si` so it returns to compact section-colored text links instead of oversized equal-width button cards.
- Fixed manual `IT`/`EN` translation patching so the top-nav labels animate through the same visible patch lifecycle as the page content instead of snapping directly to the target language.

### Changed

- Lightened the Home shell chrome so the intro question and the three Home choices remain the only in-page entry surface while the top chrome stays available.
- Kept public routes, published-only manifest loading, browser-language entry behavior, and admin boundaries unchanged.

### Semver

- Patch release: this corrects already-shipped public-shell regressions without adding new routes, new publishing capability, or new admin surface area.

## [0.18.0] - 2026-05-30

### Added

- Added an in-context private Resume draft layer on `/admin#/resume` so Alessandro can read draft-only Resume content inside the same site shell instead of relying only on strip-level admin state.
- Added bilingual private draft rendering for the admin Resume surface, so the draft card follows the active `IT`/`EN` language on the protected admin origin.
- Added regression coverage for private-vs-public Resume separation, blocked-with-document redaction, and `/admin#/resume` in-context draft visibility.

### Changed

- Changed blocked or invalid private Resume reads so they no longer inject `draft / non-public` markup or private draft values into the `/admin#/resume` page surface, even when the blocked payload still contains an identity-valid document body.
- Kept public `#/resume`, public assets, `data/published.json`, `/admin#/blog`, `/admin#/resources`, and the guarded `/admin/resume` compatibility route unchanged.

### Semver

- Minor release: this adds a new owner-visible protected admin Resume reading capability, not just a patch-sized fix to an existing flow.

## [0.17.0] - 2026-05-30

### Added

- Added a same-site private admin shell at `/admin` that reuses the real site frame with an admin-only utility strip and an in-site `Diagnostics` entry.
- Added private-origin static serving for the shared shell assets the protected `/admin` experience reuses (`styles`, public runtime modules, published manifest, and public file links).
- Added regression coverage for overlay-shell rendering, blocked/locked shell redaction, Resume `draft / non-public` visibility, diagnostics panel shell state, and the updated `/admin` regression suite.

### Changed

- Changed `/admin` from the legacy dashboard-first landing page to the shared site shell with admin-only overlay state and a shell-level diagnostics panel.
- Changed blocked and locked `/admin` states to keep the same shell structure while withholding token bootstrap metadata and all private draft values.
- Kept `/admin/resume` as a guarded compatibility path, kept the guarded save API contract intact, kept diagnostics execution/`htop`/PTY out of scope, and kept Preview/Publish/Unpublish/Upload locked.

### Semver

- Minor release: this introduces a new owner-visible protected admin entry experience and diagnostics shell rather than a patch-sized fix to existing behavior.

## [0.16.0] - 2026-05-30

### Added

- Added non-frameable `no-store` private admin bootstrap shells for `/admin` and `/admin/resume`.
- Added authenticated private-read enforcement for `GET /api/admin/editorial-summary` and `GET /api/admin/documents/resume-main` using the configured admin session header plus exact loopback `Host` matching.
- Added regression coverage for anti-framing headers, bootstrap redaction, authenticated-vs-blocked private reads, configured custom session headers, and guarded-save continuity.

### Changed

- Changed connected private admin HTML so `/admin` and `/admin/resume` now boot into deterministic loading shells and hydrate only after protected private reads succeed instead of server-rendering editorial counts, Resume draft fields, readiness diagnostics, or save-enabled controls.
- Changed the guarded save/request-preflight path to honor configured custom admin session header names instead of assuming only `x-sbar-admin-session`.
- Kept `/api/admin/health` readable without becoming a draft-bearing bootstrap substitute, kept Preview/Publish/Unpublish/Upload locked, and kept public `#/resume`, `#/blog`, `#/resources`, and published-only public rendering unchanged.

### Semver

- Minor release: this adds a new protected admin bootstrap/read contract and owner-visible security hardening while preserving public routes, published-content rules, and locked admin boundaries.

## [0.15.0] - 2026-05-30

### Added

- Added a one-time browser-language entry patch that chooses `IT` for Italian browser locales and `EN` otherwise on first public boot.
- Added deterministic browser-entry lifecycle markers plus Home-only letter-by-letter entry treatment for the initial question and section labels.
- Added regression coverage for browser-locale resolution, matching-target Italian entry behavior, reduced-motion direct landing, and the no-rerun browser-entry contract.

### Changed

- Changed first-boot public localization so non-default browser targets no longer require a manual language toggle to see the site in the likely target language.
- Changed matching-target Italian boots to stage the opposite language inside the one-time browser-entry lifecycle instead of exiting as a no-op, then settle back to coherent `IT` output.
- Kept SBR-018 Home→page reveal, SBR-019 page→page rail swap, `#/resume`, `#/blog`, `#/resources`, published-only public rendering, public error email reachability, and locked admin capabilities unchanged.

### Semver

- Minor release: this adds a new user-visible first-boot localization behavior that visitors experience immediately while preserving routes, published-content rules, and admin lock boundaries.

## [0.14.0] - 2026-05-30

### Added

- Added a quieter page→page rail swap for `Resume`, `Blog`, and `Resources` inside a persistent public page frame.
- Added deterministic public-shell route-transition markers for section-to-section rail navigation plus temporary language-control locking while that transition is active.
- Added regression coverage for the page-rail config, lifecycle markers, persistent frame surface, reduced-motion shortcut, and section-to-section no-op/busy guard behavior.

### Changed

- Changed section-to-section navigation so the target route is selected early while the current page exits laterally and the next page enters on the same rail.
- Changed reduced-motion page→page navigation to land directly on the target route without staged exit/enter waits.
- Kept the special Home→page reveal from SBR-018, browser-language auto-entry, `#/resume`, `#/blog`, `#/resources`, published-only public rendering, public error email reachability, and locked admin capabilities unchanged.

### Semver

- Minor release: this adds a new user-visible page→page navigation behavior that users can clearly perceive while preserving routes, published-content rules, and admin lock boundaries.

## [0.13.0] - 2026-05-30

### Added

- Added a distinct Home→page arrival for `Resume`, `Blog`, and `Resources` that clears the Home chooser first, reveals a centered target frame, then patches localized text from `empty → text`.
- Added deterministic public-shell route-transition markers for the Home-only arrival lifecycle plus temporary language-control locking while that transition is active.
- Added regression coverage for the Home→page timing contract, lifecycle phases, reduced-motion shortcut, and idle-cleanup behavior.

### Changed

- Changed Home chooser activation to set the target route before the staged reveal while suppressing duplicate `hashchange` rendering during the active Home-only transition.
- Changed reduced-motion Home→page selection to land directly on the target route without staged waits or token-by-token reveal work.
- Kept direct first loads, page→page navigation, browser-language auto-entry, `#/resume`, `#/blog`, `#/resources`, published-only public rendering, public error email reachability, and locked admin capabilities unchanged.

### Semver

- Minor release: this adds a new public Home→page arrival interaction that users can clearly see and feel while preserving existing routes, published-content rules, and admin lock boundaries.

## [0.12.0] - 2026-05-30

### Added

- Added a visible two-row public chrome with `sbar.si` above always-visible section navigation.
- Added translated public section labels plus deterministic active-route highlighting for Resume, Blog, and Resources.
- Added a temporary translation popup adjacent to the language control during manual IT/EN patching.
- Added regression coverage for first-paint language parity, visible Home label sync, public-shell nav behavior, and mobile nav visibility.

### Changed

- Changed the Home entry contract to `What brings you here?` / `Cosa ti porta qui?` without the extra catchphrase/helper line.
- Changed the default Italian first paint so the Home question and public nav labels already match the active `IT` language before boot completes.
- Changed Home and public-shell section labels to translate with the active language while preserving `#/resume`, `#/blog`, and `#/resources`.
- Kept published-only public content behavior, public error email reachability, and locked admin capabilities unchanged.

### Semver

- Minor release: this changes the public navigation/language chrome and Home entry behavior in a clearly user-visible way while preserving routes, published-content rules, and locked admin flows.

## [0.11.0] - 2026-05-30

### Added

- Added a protected Resume draft save capability for existing IT/EN string leaf fields inside `/admin/resume`.
- Added visible private-save states for `clean`, `dirty`, `saving`, `saved draft`, and `error` in the protected Resume editor.
- Added atomic private Resume draft rewrites plus durable redacted audit writes with rollback if the audit write fails.
- Added regression coverage for successful draft saves, incomplete-but-safe draft saves, blocked structural edits, unsafe references, body-size limits, missing-audit capability downgrade, terminal save-state persistence, and public/admin separation.

### Changed

- Changed connected `/admin` and `/api/admin/health` to advertise draft save only when the required guardrails are actually connected.
- Changed the connected protected Resume editor from read-only inspection to editable string-leaf draft saving while keeping structural edits out of scope.
- Kept Preview, Publish, Unpublish, Upload, public manifest export, public asset changes, and public admin routing unavailable.

### Semver

- Minor release: this adds a new owner-visible protected Resume draft save capability and supporting admin UX while preserving public routes and locked preview/publish/upload flows.

## [0.10.0] - 2026-05-29

### Added

- Added a no-effect admin mutation preflight gate for future Save draft, Preview, Publish, Unpublish, and Upload routes.
- Added safe preflight diagnostics that distinguish blocked requests from guard-passing-but-still-locked requests while keeping `writeEnabled: false`.
- Added deterministic action mapping for future `save`, `preview`, `publish`, `unpublish`, and `upload` admin mutation paths.
- Added regression coverage for guard failures, guard-passing locked diagnostics, CORS preflight denial, body redaction, no storage side effects, read-only route preservation, and public/admin separation.

### Changed

- Changed recognized mutation-shaped admin API routes from a generic safe-mode response to a preflight decision envelope with safe reason codes.
- Guard failures now explain that the request was blocked before content changed; guard-passing requests now explain that the action remains locked.
- Kept Save draft, Preview, Publish, Unpublish, Upload, body parsing into content handlers, durable audit writes, public manifest export, Markdown rendering, upload parsing, package metadata, production routing changes, and public admin proxying unavailable.

### Semver

- Minor release: this adds a new owner-visible protected admin security diagnostic capability and mutation preflight API behavior while preserving read-only admin behavior and locked write/preview/publish/upload capabilities.

## [0.9.0] - 2026-05-29

### Added

- Added a protected read-only Resume readiness checklist for renderable IT/EN field parity.
- Added `readiness` output to the private Resume document API with `writeEnabled: false` and `publishEnabled: false`.
- Added deterministic diagnostics for missing IT/EN paths, incompatible localized field shapes, blank localized strings, array/index mismatches, and unsafe-reference passthrough.
- Added regression coverage for the readiness API, admin checklist rendering, locked action preservation, mutation no-op behavior, public/admin separation, and dependency-free delivery.

### Changed

- Extended `/admin/resume` so Alessandro can see whether current private Resume fields are structurally ready for a future publish flow while actions remain locked.
- Hardened parity diagnostics to block whole-language missing translation cases without echoing private values.
- Kept Save draft, Preview, Publish, Unpublish, Upload, export, manifest writes, Markdown rendering, public runtime behavior, package metadata, frameworks, animation libraries, and third-party dependencies unchanged.

### Semver

- Minor release: this adds a new owner-visible protected Resume readiness checklist and API diagnostics while preserving read-only admin behavior and locked write/preview/publish/upload capabilities.

## [0.8.0] - 2026-05-29

### Added

- Added a protected read-only `GET /api/admin/documents/resume-main` endpoint for the private Resume singleton.
- Added private Resume document validation for singleton identity, status, IT/EN translation presence, and unsafe references.
- Added escaped read-only Resume field rendering inside `/admin/resume` with deterministic document, validation, language, and field markers.
- Added regression coverage for private Resume reads, path confinement, malformed/degraded document states, unsafe-reference blocking, redaction, mutation no-op behavior, public/admin separation, and dependency-free delivery.

### Changed

- Upgraded the locked Resume editor shell from placeholders to safe private document inspection when private-read guardrails pass.
- Hardened read-only Resume validation against backslash traversal, percent-encoded traversal, encoded unsafe schemes, symlink escapes, and unreadable-file path leakage.
- Kept `writeEnabled: false`, locked Save draft/Preview/Publish/Unpublish/Upload affordances, existing health/editorial APIs, public routes, package metadata, frameworks, animation libraries, and third-party dependencies unchanged.

### Semver

- Minor release: this adds a new owner-visible protected Resume document read API and inspection UI while preserving read-only admin behavior and locked write/preview/publish/upload capabilities.

## [0.7.0] - 2026-05-29

### Added

- Added the first protected Resume editor entry point from the private admin dashboard.
- Added a locked `/admin/resume` shell with IT/EN placeholder panels for future Resume editing.
- Added explicit locked Save draft, Preview, Publish, Unpublish, and Upload affordances that keep `writeEnabled: false`.
- Added regression coverage for the locked Resume editor entry, protected redaction, mutation no-op behavior, non-readable document API, public/admin separation, and dependency-free delivery.

### Changed

- Split the broader blocked Resume editor draft into a safer PR-sized locked-shell slice.
- Kept private Resume document loading, document APIs, validation, saving, previewing, publishing, unpublishing, uploading, Markdown rendering, and public manifest export unavailable.
- Preserved existing admin health/editorial API contracts, public routes, package metadata, frameworks, animation libraries, and third-party dependencies unchanged.

### Semver

- Minor release: this adds a new owner-visible protected Resume editor shell and route while preserving read-only admin behavior and locked write/preview/publish/upload capabilities.

## [0.6.0] - 2026-05-29

### Added

- Added the admin dashboard visual parity foundation for the selected Quiet Ledger + Telemetry Atlas direction.
- Added admin visual tokens for squared TUI surfaces, readable typography roles, touch targets, and motion timing.
- Added regression coverage for dashboard section order, blocked-dashboard redaction, semantic status colors, API parity, mutation no-op behavior, public/admin separation, responsive layout, and dependency-free delivery.

### Changed

- Reworked the read-only admin safe-mode dashboard, guardrail rail, editorial overview, diagnostics, and blocked state to match the squared minimal TUI visual system.
- Improved editorial readiness counts with semantic draft, ready, published, and blocked color treatment while keeping counts read-only.
- Kept `writeEnabled: false`, locked admin actions, health/editorial API contracts, mutation rejection, public routes, package metadata, frameworks, animation libraries, and third-party dependencies unchanged.

### Semver

- Minor release: this ships user-visible owner/admin visual parity for the refreshed TUI system while preserving read-only admin behavior and locked write/publish/upload capabilities.

## [0.5.0] - 2026-05-29

### Added

- Added the first production slice of the selected Quiet Ledger + Telemetry Atlas public visual direction.
- Added section identity colors for Resume, Blog, and Resources while keeping Home monochrome.
- Added a global globe-like language control that shows the current language and drives page-level patch state.
- Added expressive whole-page translation motion using the public patch-state lifecycle.
- Added regression coverage for no-scroll Home behavior, section color tokens, the language globe, whole-page patch state, manifest failure visibility, and dependency-free delivery.

### Changed

- Reworked the Home entry into a compact no-scroll TUI hub with exactly Resume, Blog, and Resources choices and no down-arrow affordance.
- Replaced the old two-button language switch with a single top-corner language globe.
- Updated public shell, chooser, route cards, status, and patch surfaces to use squarer classic TUI treatments.
- Preserved public routes, published-manifest loading, unsafe href rejection, intentional empty states, and the visible `alessandro.sbarsi@gmail.com` Resume contact path.
- Kept admin API behavior, admin write locks, package metadata, frameworks, animation libraries, and third-party dependencies unchanged.

### Semver

- Minor release: this ships user-visible public navigation, visual identity, and language interaction changes while preserving existing routes, published-content behavior, and locked admin capabilities.

## [0.4.0] - 2026-05-29

### Added

- Added a standalone visual-direction prototype pack for the total minimal TUI revamp.
- Added four distinct minimal terminal/TUI directions for Alessandro to review: Signal Forge, Quiet Ledger, Telemetry Atlas, and Patchroom.
- Added desktop and mobile mockups covering Home, Resume/email, Blog, Resources, public content-unavailable state, language patch states, admin guardrail rail, and admin editorial overview.
- Added an explicit art-director decision gate before any production style implementation.
- Added regression coverage that verifies the prototype pack is self-contained, dependency-free, route/contact preserving, and not wired into production runtime files.

### Changed

- Reordered the roadmap so the total minimal TUI visual revamp happens before deeper Resume editor implementation.
- Deferred the previously drafted Resume editor shell until after the refreshed visual system is chosen.
- Kept public routes, published-content behavior, admin health/editorial APIs, and admin write locks unchanged.

### Semver

- Minor release: this adds a new reviewable visual-revamp prototype workflow and roadmap gate for future production UI changes without breaking public routes or enabling admin writes.

## [0.3.0] - 2026-05-29

### Added

- Added a read-only private editorial overview for Resume, Blog, and Resources in the loopback admin dashboard.
- Added `draft`, `ready`, `published`, and `blocked` counts for each editorial area when private read guardrails are connected.
- Added `GET /api/admin/editorial-summary` so the dashboard and API expose the same read-only editorial readiness counts while keeping writes locked.
- Added private content document classification for complete translations, missing IT/EN translations, unsafe public references, archived documents, unknown types, malformed JSON, and non-object files.
- Added regression coverage for editorial overview HTML/API parity, blocked local-session redaction, unsafe-reference blocking, degraded/blocked content stores, and no-mutation behavior.

### Changed

- Expanded the admin safe-mode dashboard from guardrail status only to include owner-visible editorial readiness when tunnel, local session, and request guard are connected.
- Kept save, preview, publish, unpublish, upload, Markdown rendering, uploads, and public manifest export locked and out of scope.

### Semver

- Minor release: this adds a new read-only admin editorial overview and API for owner-facing content readiness without breaking public routes or enabling write/publish/upload capabilities.

## [0.2.0] - 2026-05-29

### Added

- Added a clean recruiter-facing home entrypoint that keeps the landing page focused on the `Resume / Blog / Resources` choice instead of rendering Blog content underneath the chooser.
- Added an identity cue that communicates Alessandro's focus on clear code, complex systems, performance, and open knowledge before section selection.
- Added deterministic primary treatment for the Resume choice so recruiters have an obvious first path while Blog and Resources remain available.
- Added an email-first Resume hero path that shows the address directly, keeps PDF/LinkedIn/GitHub available as secondary actions, and preserves a copyable email row in Contacts.
- Added a public `data/published.json` manifest and loader so Home, Resume, Blog, and Resources render from explicitly published bilingual content instead of editable source assumptions.
- Added a public content failure state that keeps `alessandro.sbarsi@gmail.com` visible and reachable when the manifest is missing, malformed, or schema-invalid.
- Added an accessible language patch status lifecycle for IT/EN switches, including idle, patching, complete, reduced-motion, and parity-error states.
- Added a loopback-only, read-only admin health shell for SSH-tunnel entry checks covering tunnel, content-store, and published-manifest health.
- Added a safe-mode admin guardrail rail for local session, request guard, path confinement, audit readiness, and public routing status while keeping writes locked.
- Added an admin threat model, authentication/data-handling security notes, and a production routing guard spike before any write, preview, publish, upload, Markdown, or Nginx production work expands.
- Added regression coverage for the clean home entrypoint, Resume email-first path, published-manifest loading, bilingual patch-key parity, route preservation, language switch context preservation, admin loopback health checks, admin safe-mode guardrails, reduced-motion behavior, unsafe public href rejection, and early keyboard focus visibility.

### Changed

- Improved reduced-motion and keyboard behavior so section choices are reachable and visible without waiting for the delayed intro reveal.
- Reworked the Resume hero copy to communicate clear code, complex systems, performance, and open knowledge before listing competencies.
- Replaced old Blog and Resources development placeholders with intentional published-content empty states.
- Improved language switching so patch transitions block concurrent clicks, preserve route/scroll/focus context, and fall back to the public content-unavailable state if renderable field parity breaks.
- Documented local admin startup and SSH forwarding while keeping the admin surface read-only.
- Extended the admin architecture, roadmap, UX, and design tokens around SSH as a transport gate plus local session/request/path/audit/routing guardrails.
- Preserved existing public routes: `#/resume`, `#/blog`, and `#/resources`.

### Semver

- Minor release: this adds user-visible recruiter entry, Resume contact-path improvements, a published-content manifest/failure-state surface, accessible language-switch lifecycle improvements, and a read-only protected-admin safe-mode shell with guardrail visibility without breaking existing routes or removing existing sections.
