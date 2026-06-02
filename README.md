# sbar.si — published Resume, Blog, Resources

`sbar.si` is Alessandro Sbarsi’s lightweight personal site: a recruiter-first Resume path, intentional Blog and Resources surfaces, bilingual IT/EN content, and a minimal TUI visual identity with language patch motion.

The public site stays static and dependency-free. It renders only published content from `data/published.json`. Private editing lives behind a loopback-only Node admin service and same-site `/admin` shell, where `/admin#/resume` can render a protected draft-only Resume layer and Resume draft saving remains guarded and private, while Preview/Publish/Unpublish/Upload stay locked until their security gates pass.

This clean snapshot intentionally keeps only the currently working runtime, content, admin guardrails, smoke example, and regression tests. Planning docs, design prototypes, brainstorming exports, local agent/GitNexus metadata, and media captures are kept out of this repo shape.

## What works today

- Public routes: intro-only `#/` plus `#/resume`, `#/blog`, and `#/resources`.
- Public arrival shell: Home stays intro-only, normal-motion Home → page activation builds one destination card-outline surface in the viewport first, then fills destination text progressively from empty patch fields; reduced motion still lands directly on the destination page.
- Public content loader: `app/content-loader.js` fetches `data/published.json`, validates schema version `1`, requires `it`/`en`, and rejects unsafe public links.
- Public contact path: `PUBLIC_CONTACT_EMAIL` is `alessandro@sbar.si`.
- Public shell polish: Resume facts/contact rows stack label-over-value, long strings wrap inside the card, and the visible footer/status strip is gone while the language popup and live status remain intact.
- Admin same-site shell: loopback-only `/admin` reuses the real site frame, exposes admin-only overlay state, and keeps diagnostics execution locked to shell-only messaging.
- In-context private Resume view: `/admin#/resume` can render a warning-coded `draft / non-public` Resume layer from the protected private read model; blocked or invalid private reads stay redacted and do not inject draft text into the page surface.
- Resume admin read path: protected `GET /admin/resume` and `GET /api/admin/documents/resume-main` expose private Resume state and readiness diagnostics when private-read guardrails pass.
- Resume draft save path: protected `PUT /api/admin/documents/resume-main` updates existing IT/EN string leaf fields only, rewrites the private draft atomically, appends a redacted audit record, and keeps the public site unchanged.
- Locked capabilities: Preview, Publish, Unpublish, and Upload still return locked no-effect diagnostics after valid preflight.

## Run the public site locally

Start a local static server from the repository root:

```bash
python3 -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173` and use the hash routes above. If port `5173` is already in use locally, pick another port and open that URL instead. Do not open `index.html` with `file://`; ES modules and manifest fetches need HTTP.

`./serve.sh` is a convenience wrapper around Python’s HTTP server. It defaults to port `5173` and binds to `0.0.0.0` for WSL/browser access.

## Run the admin service locally

Start the loopback admin service:

```bash
node admin/server.js
```

Defaults from `admin/server.js`:

| Setting | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `8787` |
| Admin shell | `http://127.0.0.1:8787/admin` |

The service refuses non-loopback bind hosts. Production access is intended through SSH local forwarding with `ssh -L 8787:127.0.0.1:8787 <server-user>@sbar.si`; public Nginx must not proxy `/admin` or `/api/admin`.

If the configured private content/audit roots are missing, the dashboard still renders, but `writeEnabled` remains `false` and `Save draft` stays unavailable until those guardrails are connected.

## Verify the protected admin example

A runnable smoke example lives in `examples/admin-preflight-smoke.mjs`. It exercises the current save and locked preview paths with throwaway private storage:

```bash
node examples/admin-preflight-smoke.mjs
```

Expected behavior:

- Missing request guards produce status `403` and `Request blocked before content changed` for the future save path.
- Valid guards on `PUT /api/admin/documents/resume-main` produce status `200` and save a private draft field change.
- Valid guards on `POST /api/admin/documents/resume-main/preview` still produce status `423` and `Preflight passed, action still locked`.

## Admin API contracts currently exposed

These contracts are sourced from `admin/server.js`, `admin/mutation-preflight.js`, `admin/request-guard.js`, `admin/resume-save.js`, `admin/body-intake.js`, and `admin/health.js`.

| Route | Method | Current behavior |
| --- | --- | --- |
| `/admin` | `GET` | Same-site private admin shell with overlay state; `#/resume` can hydrate a protected `draft / non-public` Resume layer after private reads succeed; blocked shell otherwise. |
| `/admin/resume` | `GET` | Guarded compatibility Resume editor route with editable string-leaf draft save when the Resume document is readable and save guardrails are connected; degraded/read-only states otherwise. |
| `/api/admin/health` | `GET` | Capability-aware health JSON; `writeEnabled` is `true` only when required save guardrails are connected. |
| `/api/admin/editorial-summary` | `GET` | Read-only Resume/Blog/Resources counts after private-read guardrails pass. |
| `/api/admin/documents/resume-main` | `GET` | Private Resume document read model and readiness diagnostics after private-read guardrails pass. |
| `/api/admin/documents/resume-main` | `PUT` | Protected draft save for existing string leaf fields only; `403` on guard failure, `400/413` on body-intake failure, `422` on invalid patch/unsafe references, `500` on audit/content failures, `200` on saved draft. |
| `/api/admin/documents/resume-main/preview` | `POST` | No-effect `preview` preflight; no preview HTML is rendered. |
| `/api/admin/documents/resume-main/publish` | `POST` | No-effect `publish` preflight; no manifest export occurs. |
| `/api/admin/documents/resume-main/unpublish` | `POST` | No-effect `unpublish` preflight; no manifest export occurs. |
| `/api/admin/uploads` | `POST` | No-effect `upload` preflight; no upload parser or storage exists. |

Mutation preflight requires the configured loopback `Host`, same-origin `Origin`, `Content-Type: application/json`, and the `x-sbar-admin-session` header. Save responses never publish implicitly and never rewrite `data/published.json`.

## Source modules worth knowing

| File | Purpose |
| --- | --- |
| `index.html` | Static shell mount, route frame, language control, and public layout. |
| `script.js` | Bootstraps manifest loading, routing, language state, and public error state. |
| `app/content-loader.js` | Exports `MANIFEST_URL`, `PUBLIC_CONTACT_EMAIL`, `loadPublishedContent(options)`, and `createPublishedSource(manifest)`. |
| `app/render.js` | Builds public renderable fields and section views. |
| `app/controls.js` | Owns language globe state and patch state classes. |
| `app/patch-engine.js` | Runs IT/EN patch animation over stable renderable keys. |
| `admin/server.js` | Exports `createAdminConfig(options)`, `buildAdminResponse(...)`, `createAdminServer(options)`, and `startAdminServer(options)`. |
| `admin/mutation-preflight.js` | Exports `getAdminMutationPreflightRoute(...)` and `evaluateAdminMutationPreflight(...)`. |
| `admin/request-guard.js` | Exports Host/Origin/session/content-type guard helpers for admin mutations. |
| `admin/body-intake.js` | Enforces bounded JSON request-body intake before draft-save parsing. |
| `admin/resume-save.js` | Validates bounded Resume field patches, writes drafts atomically, and appends redacted audit records. |
| `admin/resume-document.js` | Reads and validates the private `resume-main` document through path confinement. |
| `admin/resume-readiness.js` | Checks IT/EN renderable field parity while keeping `publishEnabled: false`. |
| `admin/public/admin.js` | Drives the protected Resume editor’s `clean`/`dirty`/`saving`/`saved draft`/`error` client states. |
| `admin/audit.js` | Creates redacted audit records and checks private audit-storage readiness. |

## Content sources

- `data/published.json` is the public source of truth.
- `content.js` is retained as seed/fallback maintenance content; it is not the public publishing workflow.
- Public Blog and Resources show intentional empty states when no published documents are exported.
- Public links must remain public-safe: relative public paths plus allowed `http:`, `https:`, and `mailto:` schemes.

## Quality gate

Run syntax checks for the JavaScript surface:

```bash
node --check script.js content.js config.js app/*.js admin/*.js tests/*.mjs
```

Run the latest focused public-shell regression:

```bash
node tests/sbr-030-home-to-page-visible-page-ingress-and-chrome-sync.test.mjs
```

For release confidence, run all `tests/sbr-*.mjs` sequentially. The current repository intentionally has no package metadata; Node may emit `MODULE_TYPELESS_PACKAGE_JSON` warnings because ES modules are used without package metadata, and that warning is currently non-blocking.

## Explicitly not enabled yet

The admin service still does **not** implement Preview rendering, sanitized Markdown output, Publish/export, Unpublish export, Upload parsing/storage, public manifest writes, public asset copying, production Nginx/systemd config, a public `/admin` proxy, package metadata, frameworks, or third-party dependencies.

## Deploy shape

The public site is static: serve the repository’s public files and `data/published.json` from a static web root. Keep the Node admin service bound to loopback only, reachable by SSH local forwarding, and keep `/admin` plus `/api/admin` off the public Nginx surface.

## Release state

Latest documented release: `0.18.9` in `CHANGELOG.md`.

Local tags may lag release notes; before publishing tags or pushing, check `git tag --list` and the configured remote intentionally.

## Contributing safely

- Preserve the public routes: `#/resume`, `#/blog`, and `#/resources`.
- Preserve the primary public email: `alessandro@sbar.si`.
- Keep Preview, Publish, Unpublish, Upload, and public export locked until the relevant security/control story explicitly enables them.
- Keep examples short and runnable; prefer `examples/` for anything longer than a focused snippet.
- Do not add dependencies or package metadata without a dedicated tooling/security decision.
