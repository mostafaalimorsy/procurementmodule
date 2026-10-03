# Frontend

Angular 21 standalone application, strict TypeScript, lazy feature routes and Vitest tests. Node 22.12+ (22.x) and npm 10 are the supported local baseline. Commit `package-lock.json`; install reproducibly with `npm ci`.

```sh
npm ci
npm start                 # http://localhost:4200; API at localhost:5080
npm run build             # production /en/ and /ar/ bundles
npm test                  # one-shot Vitest suite
npm run extract-i18n      # refresh src/locale/messages.en.json after marking strings (then run Prettier on it)
```

No lint target is configured. Angular's strict template/type checks run during build.

`package.json` `overrides` pins `undici` 7.29.0 → 7.29.1 for advisory GHSA-3wwx-pv8p-q78v: it is a dev-toolchain transitive dependency of `@angular/build` 21.2.23, which pins 7.29.0. Drop the override when `@angular/build` is upgraded to a release that ships a fixed `undici`.

## Boundaries

- `src/app/core/auth`: local cookie-backed tenant session, login/logout, permission route guard and structural action directive.
- `src/app/features/identity`: login, invitation acceptance, password recovery and Company Admin user management.
- `src/app/core/api`: same-origin API convention and future generated OpenAPI client boundary.
- `src/app/features/overview`: minimal workspace shell and health connectivity.
- `src/app/shared/ui` and `shared/styles`: reusable presentation components and tokens, with no business dependencies.
- `src/app/features/projects`: accepted Part 3 project/work-package UI.
- `src/app/features/subcontractors`: Part 4 subcontractor directory — list, detail, form, trade administration and the CSV/XLSX import page.
- `src/app/features/sourcing`: Part 5 sourcing & prequalification — list, detail (discovery, prequalification checklist, shortlist, approval and reopen, history) and the work-package panel.
- `src/app/features/tendering`: Part 6 tenders — list, six-step builder, control center, invitation dialog (activity, deliveries, link actions) and the work-package panel.
- `src/app/features/email`: company email delivery settings and the console's platform server and template editor.
- `src/app/features/bidder`: the public no-account bidder portal (`/tender-invitation`, outside both shells) with the buyer's logo and name and the system name, and the bid workspace (commercial, technical, files, review, confirmed submission, receipt; autosave, two-tab conflict handling, queued uploads with progress). The link token is read from the fragment, removed from the address bar and kept in memory only.
- `src/app/features/evaluation`: Part 9 bid opening and evaluation — the evaluation page (opening record, file classification, overview and progress, completion), the technical workspace (scorecard per bid; nothing priced), commercial leveling (side-by-side matrix at ≥ 48rem and cards below, adjustments drawer, aligned lines, scope matrix, flags) and the scorecard policies page. The close-early dialog lives in the tender control center.
- `src/app/features/decision`: Part 10 negotiation, recommendation, approval and award — the negotiation rounds page (issue a Revision/BAFO round to a chosen subset, close/cancel, withdraw a firm, replace its link, notes), the original/revised/final comparison (one bid at a time), the decision workspace (readiness, recommendation by rank with current and historical evidence apart, prepare/override, approval route and actions, award with its immutable baseline, timeline), and the recommendation-policy and approval-matrix admin pages. The selected firm's round page is `features/bidder/tender-negotiation` (`/tender-negotiation`, outside both shells, round link from the fragment); it reuses the bid workspace through the `BID_WORKSPACE_BACKEND` token.
- `src/app/features/performance`: Part 11 performance closeout — the closeout list (`/closeouts`), the closeout workspace (`/closeouts/:awardId`: awarded / actual / variance side by side, short steps owned by Commercial/QS or the Project Manager, completeness, confirmed close, reopen with a reason, versions and lifecycle), the subcontractor profile's "Project performance" history (sample size and recency first, no headline score), the history evidence shown inside a recommendation (the Home closeout-gap indicator became part of the Part 12 dashboard). Money stays exact decimal strings; variances are signed two-decimal strings shown with their direction in words.
- `src/app/features/intelligence`: Part 12 subcontractor intelligence and the Home dashboard — the profile's intelligence section (category selector; reliability, time to first bid, award rate, price position and completed projects, each with its evidence count; procurement history, awards and decisions, bid behaviour, delivery evidence, similar projects, "How are these figures calculated?"), the evidence-strength badge (words and a mark, never colour alone), the sourcing page's candidate evidence (never ranks or shortlists) and the Home dashboard (attention list and figures linking to filtered lists; a section the server withheld is not rendered). A field the reader may not see is absent from the response, never hidden here.
- `src/app/features/search`: Part 12 company-wide search (`/search`, the query lives in the address; only the record types the server returned appear).
- `src/app/features/audit`: Part 12 audit log for Company Administration (`/admin/audit`: server filters, paging and CSV export).
- `src/app/features/company`: Company settings (default currency, logo); `shared/ui/currency-select.ts` is the one ISO currency picker and `core/localization/money.ts` the exact decimal-string money helpers (never floating point).
- `src/app/core/localization`: active locale/direction, language switching, business formatting, label catalogues and the product-problem mapping.
- `src/app/shells`: `PlatformShell` (/platform/**) and `WorkspaceShell` (all company routes); the root component is an empty outlet.
- `src/app/core/entitlements` and `shared/ui/quota-usage.ts`: one utilization model and presenter shared by the console and the Company Admin plan panel.

The API is authoritative for permissions and tenancy. The browser never selects a tenant using a
request header/body, persists passwords/tokens, or trusts local role overrides. Invitation/reset
tokens arrive in URL fragments, are removed from browser history immediately, and are posted in
request bodies. Failed or malformed session responses clear access.

Protect future routes using `canActivate: [permissionGuard]` and `data: { permission: 'projects.read' }`; permission names must match backend constants. Gate an action with `*appHasPermission="'projects.write'"`. These are presentation controls only; enforce each operation in the API.

## Layout, deployment and PWA readiness

`@angular/localize` builds English `/en/` and Arabic `/ar/`. The source catalog is
`src/locale/messages.en.json`; edit `messages.ar.json` for Arabic. Use stable custom IDs when marking
new copy. `npm start` is the single-locale English development server; use the production build with
Nginx to test the language selector across both builds. The selector reloads while preserving the
route, query and fragment; a non-sensitive cookie selects the locale for old/unprefixed URLs.
`LocaleService` owns active language/direction. Business dates are Gregorian; business numbers and
ISO-currency values use Latin digits in both languages. Technical tokens use local LTR isolation.
Every Parts 1–5 screen is translated; emails are not (no persisted locale). Plurals use ICU inside a
tight `<span i18n="@@id">` so the ID stays stable. Server refusals are localized from their stable
`code` in `core/localization/product-problem.ts`. There are no remote font or script dependencies: Arabic uses the bundled IBM Plex Sans Arabic WOFF2 files in
`public/fonts/ibm-plex-sans-arabic/` (SIL OFL 1.1, licence alongside), selected by `:root:lang(ar)`
typography tokens. `npm run build` ends with `scripts/verify-locales.mjs`, which fails the build on a
missing/obsolete translation, placeholder mismatch, wrong `lang`/`dir`, or a broken Arabic font contract.

The Docker image serves the built artifact on port 8080 and proxies API/health requests to Compose
service `api:8080`. `PRODUCT_CONTEXT` (`workspace` or `platform`) selects which product's entry routes a
container owns; `WORKSPACE_PUBLIC_ORIGIN` and `PLATFORM_PUBLIC_ORIGIN` are the cross-host redirect
targets (`nginx/*.conf`, ADR-033). API hosts and secrets never enter the browser bundle. Configure HTTPS at the pilot ingress/reverse proxy before external exposure.

Production disables critical CSS inlining so Angular emits a normal stylesheet link without an inline load handler. Script/style minification stays enabled and nginx retains `script-src 'self'`.

PWA readiness means a responsive shell, lazy features, same-origin API and a deployable static build. No service worker or offline cache is installed: authenticated tenant data must not be cached offline without an explicit isolation, logout and invalidation design.

Session/health calls are deliberately hand-written bootstrap adapters. Generate typed business clients from OpenAPI when the first business API arrives.
