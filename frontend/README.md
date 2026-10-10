# MPloyChek SPA (frontend)

Angular SPA for the **MPloyChek – Digital Background Verification** user management application.
Delivered so far: **Phase 1** - architecture, tooling and development environment; **Phase 5** - the
authentication system (login, session, guards and the bearer interceptor); **Phase 6** - the
logged-in dashboard (profile, statistics and records, with real configurable API latency). The admin
user management screen is still a guarded placeholder.

> The full architecture (both applications, request lifecycle, phase roadmap) is documented in the
> [root README](../README.md).

## Stack

| Concern         | Choice                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Framework       | Angular 20 (standalone components, signals, zoneless-ready structure)   |
| Language        | TypeScript 5.9, `strict` + `strictTemplates`                            |
| Routing         | Angular Router with lazy `loadChildren` feature boundaries              |
| HTTP            | `HttpClient` (fetch backend) + functional interceptors                  |
| Reactive        | RxJS 7 (`take`, `map`, `timeout`, `catchError`)                         |
| Forms           | Reactive forms (`NonNullableFormBuilder`, validators)                    |
| UI              | Angular Material 20 (Material 3 azure theme) + Material Icons + Roboto  |
| Unit tests      | Karma + Jasmine (`ChromeHeadless`)                                      |

## Commands

```bash
npm install        # install dependencies
npm start          # ng serve            -> http://localhost:4200
npm run build      # production build    -> dist/frontend
npm run typecheck  # tsc --noEmit for app + spec configs
npm test           # ng test (watch mode)
npm run test:ci    # ng test --watch=false --browsers=ChromeHeadless
```

The dev server expects the API at `http://localhost:3000/api` (see
`src/environments/environment.development.ts`); start it with `npm run dev` in `../backend`.

## Structure

```
src/
├── environments/                 # environment.ts (prod) + environment.development.ts
├── styles.scss                   # Material 3 theme + shared page primitives
└── app/
    ├── app.config.ts             # composition root: router, HttpClient, interceptors, tokens
    ├── app.routes.ts             # root routes (lazy features + shell layout route)
    ├── core/                     # singletons, cross-cutting concerns, no feature UI
    │   ├── constants/            # route paths / links
    │   ├── guards/               # authGuard, roleGuard/adminGuard/generalUserGuard
    │   ├── interceptors/         # auth (bearer + 401), delay, timeout, error normalisation
    │   ├── models/               # API envelope, user, auth session, record, health, error models
    │   ├── services/             # AuthService, AuthStorageService, UserService, RecordService, AppInfoService, HealthService
    │   ├── tokens/               # API_BASE_URL, API_DELAY_MS, API_TIMEOUT_MS
    │   └── utils/                # jwt (client-side expiry), api-error-message, app-logger
    ├── shared/                   # reusable, feature agnostic
    │   ├── components/           # page-header, not-found
    │   └── ui/                   # MATERIAL_MODULES, FORMS_MODULES barrels
    ├── layout/app-shell/         # toolbar + navigation + status footer + router-outlet
    └── features/
        ├── auth/                 # login page wired to AuthService (reactive form)
        ├── dashboard/            # logged-in dashboard: profile, stats, records table
        └── admin/                # admin user management area
```

## Conventions

- **Standalone components** everywhere - no `NgModule`s; shared imports come from
  `shared/ui` barrels (`MATERIAL_MODULES`, `FORMS_MODULES`).
- **Data access in services**, never in components. Services inject `HttpClient` and
  `API_BASE_URL`, unwrap the `{ success, data }` envelope with `map` and return `Observable<T>`.
- **Config through tokens**: nothing outside `app.config.ts` / `AppInfoService` reads `environment`.
- **Signals for view state**, RxJS for data flow.
- Feature folders may only be imported by their lazy route entry point, which keeps bundles honest.

## Authentication

The auth *feature module* is the lazy `features/auth` boundary (`auth.routes.ts` + `pages/login`);
the shared machinery lives in `core/` so the dashboard, admin and future records features can reuse
it without importing the auth feature. Components never hold a token or call the API directly.

```
LoginComponent ──► AuthService ──► HttpClient ──► authInterceptor (Bearer) ──► POST /api/auth/login
      ▲               │                                                        │
      │               └── AuthStorageService (sessionStorage, namespaced key)   │
      │                                                                        ▼
   AuthGuard / RoleGuard ◄── session signal ── AuthService ◄── httpErrorInterceptor (ApiHttpError)
```

| Piece                   | Responsibility                                                                 |
| ----------------------- | ------------------------------------------------------------------------------ |
| `AuthService`           | The single source of truth: `login()`, `logout()`, `refreshCurrentUser()`, `hasRole()`, `token()`, and the `currentUser` / `role` / `isAuthenticated` signals |
| `AuthStorageService`    | The only code that touches Web Storage, so the persistence strategy can be swapped in one place |
| `authInterceptor`       | Attaches `Authorization: Bearer <token>` to API calls; on an expired/rejected token it clears the session and returns to login |
| `authGuard`             | Unauthenticated visitors -> `/auth/login?redirectTo=<url>`                       |
| `roleGuard(...)`        | `adminGuard` / `generalUserGuard`: wrong role -> `/dashboard?denied=<role>`      |

**Token storage.** The session is kept in memory (a signal) and mirrored to `sessionStorage` under
a namespaced key, so a page refresh keeps the user signed in while the credential is discarded when
the tab closes. `sessionStorage` is preferred over `localStorage` (a bearer token shared across tabs
and persisted indefinitely is a bigger XSS blast radius), and the app never needs an httpOnly
cookie because the backend issues stateless JWTs. Swapping to `localStorage`, memory-only or a
cookie exchange is a change to `AuthStorageService` alone.

**Error handling.** `httpErrorInterceptor` normalises every failure to `ApiHttpError`;
`describeAuthError()` turns the code into a message, so the login screen covers invalid credentials,
role mismatch, inactive account, an unreachable API and a timeout, and shows a loading state while
the request is in flight. A locally expired token is treated as signed-out before any request is
made (the server still re-verifies everything).

**Boundaries.** Hiding the Admin link is a convenience only - the route guard and, independently,
the backend authorize every request.

## Dashboard

The signed-in landing page (`features/dashboard/pages/dashboard`) shows the user profile, a row of
statistics and the verification records table, and is reachable only behind `authGuard`.

- **Data** comes from `UserService.getCurrentUser()` (`GET /api/users/me`) and
  `RecordService.getRecords({ limit: 100, delayMs })` (`GET /api/records?limit=100&delay=<ms>`),
  joined with `forkJoin`.
- **Scoping is the API's job**: a general user receives only their assigned records, an
  administrator receives every record. The dashboard renders whatever the API returns and labels the
  scope accordingly.
- **State** is one RxJS pipeline exposed as a signal: a `BehaviorSubject` reload trigger is
  `switchMap`-ped into the joined request, with `startWith` for the loading state and `catchError`
  for the error state. `switchMap` means changing the delay or pressing Retry cancels any request
  still in flight.
- **States** are exhaustive: a `mat-progress-bar` + skeleton blocks while loading, a friendly empty
  state, and an error state with a **Retry** button. A "Waiting for the API…" banner names the
  request so it is obvious the app is awaiting a response.
- **The delay control** (No delay / 1s / 3s / 5s) sends `?delay=<ms>` to the API - the latency is
  the backend's real asynchronous wait, never a frontend `setTimeout`. `0` is sent explicitly so the
  choice is always honoured.
- The table is a responsive Angular Material table (`mat-table`) inside a horizontally scrollable
  container.
