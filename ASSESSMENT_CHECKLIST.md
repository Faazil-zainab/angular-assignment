# NSQTech assessment — requirement checklist

Maps every requirement from the NSQTech brief to its implementation, the method used to verify it,
the **actual** result, and a status.

**Statuses:** `PASS` = verified with executed evidence · `NOT VERIFIED` = not confirmed here (human
judgement or tooling this session did not have) · `FAIL` = not satisfied.

> Honesty note: **no row is marked `PASS` on assumption.** Every `PASS` names the command or live
> measurement that produced it. A real browser session *was* run (headless Chrome against the built
> app) and the screenshots in `docs/screenshots/` are genuine captures of that session — no
> placeholder is presented as a screenshot, and no result is reported that was not executed.
> The one subjective row (item 22) is deliberately left `NOT VERIFIED`. See
> [Manual checks still outstanding](#manual-checks-still-outstanding).

**Environment:** Windows, Node **v24.15.0**, npm 12.0.2, Angular 20.3, Express 5.

## Defect found and fixed in this final pass

| Defect | How it surfaced | Fix |
| ------ | --------------- | --- |
| The SPA **did not boot at all**: the pathless layout route in `frontend/src/app/app.routes.ts` declared no `path`/`matcher`, so the Router rejected the whole table at startup with `NG04014` and the app rendered an empty shell. Unit tests passed because `app.spec.ts` supplied `provideRouter([])` — an empty table that never validates the real routes. | First headless-Chrome render of the built app; the page loaded (`200`) but never produced a login form, and the console logged `[mploychek:bootstrap] the application failed to start NG04014`. A plain HTTP probe could not have caught this: a dev server answers `200` for any path. | Added `path: ''` to the layout route, and added `frontend/src/app/app.routes.spec.ts` (4 tests) that validates the **real** route table. Verified non-vacuous: reverting the fix makes 2 of the 4 fail with the same `NG04014` error. |

| # | Requirement | Implementation location | Verification method | Actual result | Status |
| - | ----------- | ----------------------- | ------------------- | ------------- | ------ |
| 1 | Angular 12+ SPA | `frontend/` (Angular 20.3) | `npm --prefix frontend run typecheck`, `npm run build`, `npm run test:ci`, **headless Chrome render of the built app** | typecheck pass; production build pass (no warnings); **49/49** tests pass; the app boots and renders in a real browser: login form, dashboard with records rows, user management with rows; `/`, `/auth/login`, `/dashboard`, `/admin` all return **HTTP 200** | **PASS** |
| 2 | Node.js + TypeScript backend | `backend/` (Express 5, TS 5.9 strict) | `npm --prefix backend run typecheck`, `npm run build`, live run of `node dist/server.js` | typecheck pass; `tsc` → `dist/` pass; server boots, seeds and serves | **PASS** |
| 3 | Login with User ID, Password, Role | `frontend/src/app/features/auth/pages/login/` | 4 unit tests (`login-page.spec.ts`) + live API login for both roles + failure cases | invalid form does not post; success stores session and navigates; wrong password `401`; role mismatch `403`; missing field `400` | **PASS** |
| 4 | Roles: ADMIN and GENERAL_USER | `backend/src/models/user.model.ts`, `frontend/src/app/core/models/user.model.ts` | login for each role; role-scoped responses; seed fixtures | both roles authenticate and receive role-scoped data | **PASS** |
| 5 | User profile (user details API) | `GET /api/users/me` → `user.controller` → `user.service`; rendered by the dashboard profile card | live `GET /users/me` with a general-user token + dashboard unit test asserting profile text | `200` with name/userId/email/role/department; dashboard test asserts `General User` / `user@mploychek.local` render | **PASS** |
| 6 | Records table | `dashboard` records table (`GET /api/records`) + `RecordService` | 5 dashboard unit tests + live `GET /records` | records render with candidate, type, company, status badge, risk badge, dates; loading/empty/error+retry covered | **PASS** |
| 7 | Role-based access control (backend-enforced) | `middleware/auth.middleware.ts` (`authenticate`/`authorize`/`requireAdmin`), `services/record.service.ts` (per-row scoping) | backend RBAC test suites + live matrix of admin endpoints called by a general user | general user → `403 INSUFFICIENT_ROLE` on all admin endpoints; foreign record → `403 RECORD_FORBIDDEN`; general user sees only their 10 rows; admin sees all 16 | **PASS** |
| 8 | Admin user management (create/edit/activate/deactivate/delete/search/filter/paginate) | `frontend/src/app/features/admin/pages/user-management/` + `/api/users` CRUD | live end-to-end admin workflow + backend `users.admin.test.ts` | create `201`, duplicate `409` (id + email), edit `200`, search finds the user, role/department filters correct, pagination pages correctly, deactivate → inactive login `403` → reactivate `200`, delete `200` then `404`; self-deactivation/deletion `409` | **PASS** |
| 9 | Dummy authentication API | `POST /api/auth/login` → `auth.controller` → `auth.service` → `token.service` | live login + `auth.test.ts` (16 assertions) | `200` with JWT; `401`/`403`/`400` cases correct; identical `401` for unknown user (no enumeration) | **PASS** |
| 10 | Dummy records API | `GET /api/records`, `GET /api/records/:id` | live run + `records.test.ts` | filtered/searchable/paginated; ownership enforced; invalid filters `400` | **PASS** |
| 11 | Local JSON persistence (no external DB) | `backend/src/repositories/` → `backend/data/users.json`, `backend/data/records.json` | file inspection + **live create → restart → read → delete** probe + `persistence.test.ts` | both files are JSON arrays (2 users / 16 records); digests are `$2b$10$…`; no plaintext `password` field; a user created before a restart was still present after it | **PASS** |
| 12 | Passwords hashed, never returned | `utils/password.ts` (bcrypt cost 10), `models/user.mapper.ts` (`toPublicUser`) | storage inspection + live response inspection + tests | no response contains `passwordHash`; store contains only `$2b$10$…`; `password` field absent | **PASS** |
| 13 | Configurable asynchronous API delay | `middleware/api-delay.middleware.ts`, `utils/delay.ts`, `frontend` `apiDelayInterceptor` | live measurement of `?delay=0/1000/3000/5000` + non-blocking probe + `records.test.ts` | 5 ms / 1024 ms / 3014 ms / 5019 ms; `?delay=abc` → `400 INVALID_DELAY`; a concurrent `GET /health` answered in **2 ms** during a 3 s delay (event loop free) | **PASS** |
| 14 | `UserService` | `backend/src/services/user.service.ts` (hashing, uniqueness, self-protection, 404/409) | `users.admin.test.ts` + live admin workflow | all user rules enforced in one service; controllers stay thin | **PASS** |
| 15 | Modular architecture | Layered backend (`routes→controllers→services→repositories`); feature-first frontend with lazy `loadChildren`/`loadComponent` | production build output inspection | one lazy chunk per feature: `app-shell`, `login-page`, `dashboard`, `user-management`, `not-found` | **PASS** |
| 16 | Security hardening | JWT verify (alg/iss/aud/exp + claim checks), timing-equalised login, helmet, CORS allow list, zod validation, central error handler, production secret guard | Phase 9 pass + live failure matrix | missing/malformed/**expired**/foreign token → `401`; unknown route → `404`; invalid body/query → `400`; oversized body → `413`; no stack traces leaked | **PASS** |
| 17 | Testing | `backend/tests/` (8 suites) + `frontend/**/*.spec.ts` | executed both runners | **103/103** backend tests pass (25 suites, 0 fail); **49/49** frontend tests pass, including the 4 new `app.routes.spec.ts` route-configuration tests (verified non-vacuous: they fail with `NG04014` when the fix is reverted) | **PASS** |
| 18 | Documentation | `README.md`, `backend/README.md`, `frontend/README.md`, this checklist, `docs/screenshots/README.md` | manual review of files | root README covers objectives, features, stack, architecture + Mermaid diagram, JWT workflow, RBAC, JSON design, seeding, prerequisites, env vars, setup, builds, credentials, API tables, examples, delay, tests, verification, deployment + limitations, screenshots, security, design decisions, limitations | **PASS** |
| 19 | Frontend/backend production builds | `npm run build` (root) or per package | executed | backend `tsc` → `dist/` pass; frontend `ng build` pass, no warnings | **PASS** |
| 20 | Configurable frontend API URL for deployment | `frontend/src/environments/environment.ts` + `angular.json` `fileReplacements` + `API_BASE_URL` token | source review + `ng build --configuration development` / production build | the deployment URL is a single value (`apiBaseUrl`) swapped per build configuration; nothing else imports `environment` | **PASS** |
| 21 | Responsive layout (mobile / tablet / desktop) | `frontend/src/styles.scss` tokens + component media queries (shell drawer at 64rem, grids reflow, tables scroll) | `node docs/screenshots/capture.mjs` — measured at 1440 / 768 / 390 px in headless Chrome, plus `06`/`07` screenshots | nav is **docked at 1440 px** and switches to the **overlay drawer at 768 px and 390 px** (hamburger present); `document.scrollWidth == innerWidth` at every width (no horizontal overflow); KPI grid reflows **5 → 3 → 1** columns; real screenshots committed | **PASS** |
| 22 | Creative, professional, original UI | `frontend/src/styles.scss` design system + `login`, `app-shell`, `dashboard`, `admin` templates | code review + 7 genuine screenshots in `docs/screenshots/` | The code is original (Material 3 theme, tokens and shared primitives, not copied from any site) and the screens render correctly in a real browser. **Aesthetic quality is subjective and has not been reviewed by a human**, so this row stays unverified rather than claiming PASS on my own judgement. Screenshots are committed for the reviewer to judge. | **NOT VERIFIED** |
| 23 | Accessibility (semantic HTML, keyboard navigation, labels, focus states, readable contrast) | semantic HTML, `aria-*`, `<fieldset>`/`<legend>`, `scope="col"`, global `:focus-visible` ring, reduced-motion guard, `visually-hidden` | `node docs/screenshots/capture.mjs` — measured on **login, dashboard and user management** | **30/30 interface checks pass.** Labels: every form control labelled (5/5), every button named (22/22). Keyboard: `Tab` reaches interactive controls in order (7/7 + 8/8 + 8/8 stops) and every stop matches `:focus-visible`. Focus states: each sampled control **visibly changes when focused** (rendered-pixel diff with animations/caret neutralised). Semantics: `main` landmark, labelled `nav`, headings, `th[scope="col"]` (7 per table), live regions, `aria-hidden` icons. Contrast: WCAG AA met across **456 sampled text elements** (203 + 69 + 184). | **PASS** |
| 24 | No external database | `repositories/` (JSON only); no DB driver in `package.json` | dependency review + storage inspection | dependencies are Express, cors, helmet, dotenv, jsonwebtoken, bcryptjs, zod only; no MongoDB/DynamoDB/Postgres | **PASS** |
| 25 | No secrets committed | `.gitignore` rules; `.env.example` placeholders | `git check-ignore` + working-tree secret scan (see Phase D) | `.env`, `.env.*`, `node_modules/`, `dist/`, `coverage/`, logs and generated `data/*.json` are ignored; no credentials/tokens/keys found in source | **PASS** |

## Manual checks still outstanding

1. **Subjective visual review** (item 22): seven genuine screenshots are committed in
   [`docs/screenshots/`](docs/screenshots/), but whether the UI *looks* premium is a judgement call
   that a human reviewer should make — it is deliberately left **NOT VERIFIED** rather than claimed
   on my own opinion.
2. **Assistive-technology audit**: no axe/Lighthouse audit and no real screen-reader walkthrough was
   run. Item 23's PASS is based on the measurable checks the harness performs (labels, Tab order,
   `:focus-visible`, visible focus indicator, landmarks, table semantics, contrast), not on an
   end-to-end screen-reader session.

Neither is a code defect. Screenshots, keyboard order, focus visibility, contrast and responsive
behaviour are all measured and passing; what remains is human judgement and assistive tech testing.
