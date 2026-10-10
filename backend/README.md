# MPloyChek API (backend)

Node.js + TypeScript + Express REST API for the **MPloyChek – Digital Background Verification**
User Management SPA.

Delivered so far:

- **Phase 1** - architecture, development environment, health endpoint.
- **Phase 2** - authentication: seeded users, `POST /api/auth/login`, JWT issuing and verification,
  the `authenticate` / `authorize` middleware, `GET /api/users/me`.
- **Phase 3** - the persistent **local JSON store**: a repository layer, `users.json` /
  `records.json`, safe file handling, bcrypt hashing and a seeding mechanism.
- **Phase 4** - the **records API**: backend-enforced role based access control (a general user
  sees only their assigned records), status / risk / verification-type filtering, case-insensitive
  search, pagination, and a **validated, non-blocking** configurable response delay.

> The full architecture and phase roadmap are documented in the [root README](../README.md).

## Stack

| Concern       | Choice                                                              |
| ------------- | ------------------------------------------------------------------- |
| Runtime       | Node.js >= 20.19 (verified on Node 24)                               |
| Language      | TypeScript 5.9, `strict`                                             |
| HTTP          | Express 5                                                            |
| Auth          | `jsonwebtoken` (HS256)                                               |
| Passwords     | `bcryptjs` (bcrypt, cost 10) - no native build step                   |
| Validation    | `zod` schemas enforced by a `validateBody` middleware                |
| Persistence   | **Local JSON files** via `fs/promises` - no external database         |
| Cross-cutting | `cors`, `helmet`, `dotenv`                                           |
| Dev runner    | `tsx watch`                                                          |
| Tests         | Node's built-in test runner (`node --test`)                          |

## Commands

```bash
npm install          # install dependencies
npm run dev          # tsx watch src/server.ts  -> http://localhost:3000/api
npm run seed         # create/reset the development data (users + records)
npm run build        # clean + tsc -> dist/
npm start            # run the compiled build
npm run typecheck    # tsc --noEmit for src/ and tests/
npm test             # isolated test run against the real app on an ephemeral port
```

`.env` is optional: every key has a safe built-in default that matches `.env.example`, so the API
boots with no configuration at all.

```bash
cp .env.example .env
```

## Data Storage

**The project intentionally uses local JSON persistence (`backend/data/users.json` and
`backend/data/records.json`) instead of an external database.** This is a coding assessment and the
requirement explicitly permits local storage, so the goal is to demonstrate the *architecture* that
would sit in front of a real database - not to require a reviewer to install, run and seed a
database server before they can look at the code.

What that means concretely:

- **No service to run.** Clone, `npm install`, `npm run dev`. The data directory and both documents
  are created automatically on first use and seeded with development data.
- **The persistence layer is already isolated.** Every read and write goes through a repository
  (`src/repositories/`), which is the only code that touches `fs` or `JSON.*`. Swapping in MongoDB,
  Postgres or DynamoDB means writing new repository implementations and changing which instances
  the services import - no controller, service, route, model or test has to change.
- **Nothing is lost on restart.** Seeding only *creates what is missing*; it never replaces an
  existing document.

### Files

| File                        | Contents                                                     |
| --------------------------- | ------------------------------------------------------------ |
| `backend/data/users.json`   | A JSON **array** of users, including bcrypt `passwordHash`    |
| `backend/data/records.json` | A JSON **array** of background verification records           |
| `backend/data/.gitkeep`     | Keeps the directory in version control                        |

The documents themselves are **not committed** (they are generated): `data/*.json` is gitignored so
no password digest ever lands in the repository, and the directory is recreated by `npm run seed` or
the first boot. `npm run seed` also resets the two development accounts and the seven demo records
if you have edited them.

### Architecture

```
Route
  → Controller      (HTTP ⇄ service, no fs, no JSON)
    → Service       (business rules: hashing, uniqueness, ownership, 404/409)
      → Repository  (all JSON parsing/stringifying + all fs access)
        → JSON file (backend/data/*.json)
```

`JsonCollectionRepository<TEntity>` is the shared base for both collections:

| Responsibility        | How                                                                              |
| --------------------- | -------------------------------------------------------------------------------- |
| Read/write            | `fs/promises` only - never `readFileSync`/`writeFileSync`                          |
| Atomic writes         | Write to `*.json.<pid>.tmp`, then `fs.rename` over the target                      |
| Concurrency           | Every operation runs through one `AsyncQueue`, so read-modify-write cannot interleave and lose a write |
| Business keys         | `allocateId()` derives `USR-008` from the highest existing `USR-nnn`/`REC-nnn`     |
| Bootstrap             | Creates the directory and an empty `[]` document when missing                      |
| Validation of entries | `parseEntry()` rejects a structurally invalid record rather than silently dropping it |

Concurrency is handled **within the process**: the queue serialises competing operations in the same
worker, and the atomic rename means another process (or a crash) can never observe a half-written
file. Two *separate* processes writing the same file is last-writer-wins - acceptable for a local
single-instance development store, and the reason a real database is the answer at scale.

### Safe JSON handling

Every failure mode has a distinct, typed error code, so a broken file can never surface as a
confusing 500:

| Situation                                        | Code                    | HTTP |
| ------------------------------------------------ | ----------------------- | ---- |
| Directory or file missing                        | *(recreated, no error)* | -    |
| File present but empty / whitespace only          | *(treated as `[]`)*     | -    |
| Malformed JSON                                    | `STORAGE_MALFORMED_JSON`| 500  |
| Top level value is not an array, or an entry is invalid | `STORAGE_INVALID_DATA` | 500 |
| Read failure (permissions, `EISDIR`, ...)         | `STORAGE_READ_FAILED`   | 500  |
| Write failure (temp file, rename, disk)           | `STORAGE_WRITE_FAILED`  | 500  |

`details` always names the file (and the offending index/field for invalid data), so the failing
document is obvious from the response and the logs.

### Sample JSON

`backend/data/users.json`

```json
[
  {
    "id": "USR-001",
    "userId": "admin001",
    "name": "System Administrator",
    "email": "admin@mploychek.local",
    "passwordHash": "$2b$10$h/VPA…",
    "role": "ADMIN",
    "department": "Administration",
    "status": "ACTIVE",
    "createdAt": "2026-10-01T10:00:00.000Z",
    "updatedAt": "2026-10-01T10:00:00.000Z"
  },
  {
    "id": "USR-002",
    "userId": "user001",
    "name": "General User",
    "email": "user@mploychek.local",
    "passwordHash": "$2b$10$CdNXAE…",
    "role": "GENERAL_USER",
    "department": "Verification",
    "status": "ACTIVE",
    "createdAt": "2026-10-01T10:00:00.000Z",
    "updatedAt": "2026-10-01T10:00:00.000Z"
  }
]
```

`updatedAt` is an addition to the assessment's field list, kept so `update()` and `updateStatus()`
can be audited. `password` is stored **only** as `passwordHash` (bcrypt, cost 10).

`backend/data/records.json` (one of sixteen)

```json
[
  {
    "id": "REC-001",
    "candidateName": "Arun Kumar",
    "verificationType": "Employment",
    "status": "COMPLETED",
    "submittedDate": "2026-09-15T10:30:00.000Z",
    "completedDate": "2026-09-17T15:30:00.000Z",
    "riskLevel": "LOW",
    "assignedUserId": "USR-002",
    "company": "Tech Solutions Pvt Ltd",
    "location": "Chennai",
    "description": "Employment verification completed successfully."
  }
]
```

`assignedUserId` holds the assigned user's **business key** (`USR-002`), which is what role based
access control compares against the authenticated user's `id`. `completedDate` is present only once
a record has finished.

The sixteen demo records cover every useful state - all four statuses (`PENDING`, `IN_PROGRESS`,
`COMPLETED`, `FAILED`), all three risk levels and all five verification types - spread across dates,
companies and locations, and assigned to both seeded users (ten to `USR-002`, six to `USR-001`).

## Development users

Created automatically on boot when missing, or reset with `npm run seed`. Passwords are bcrypt hashed
before they are written - the store never contains plain text. They are fixtures for development,
not secrets.

| ID        | User ID    | Password    | Role           | Department     |
| --------- | ---------- | ----------- | -------------- | -------------- |
| `USR-001` | `admin001` | `Admin@123` | `ADMIN`        | `Administration` |
| `USR-002` | `user001`  | `User@123`  | `GENERAL_USER` | `Verification`   |

## Endpoints

| Method   | Path                     | Auth            | Description                                  |
| -------- | ------------------------ | --------------- | -------------------------------------------- |
| `GET`    | `/api/health`            | public          | Liveness report (service, env, store paths)   |
| `POST`   | `/api/auth/login`        | public          | Exchange credentials for an access token      |
| `GET`    | `/api/users/me`          | Bearer JWT      | The authenticated user's own profile          |
| `GET`    | `/api/users`             | Bearer + ADMIN  | Every user (passwords omitted)                |
| `POST`   | `/api/users`             | Bearer + ADMIN  | Create a user (`201`)                        |
| `PATCH`  | `/api/users/:id`         | Bearer + ADMIN  | Update name/email/role/department/password    |
| `PATCH`  | `/api/users/:id/status`  | Bearer + ADMIN  | Activate / deactivate an account               |
| `DELETE` | `/api/users/:id`         | Bearer + ADMIN  | Delete a user                                 |
| `GET`    | `/api/records`           | Bearer JWT      | Paged/filtered records - own records for a general user, all records for an admin |
| `GET`    | `/api/records/:id`       | Bearer JWT      | One record (`403` when it is not assigned to the caller) |

### Records API query parameters (`GET /api/records`)

| Parameter          | Values                                                             | Default |
| ------------------ | ------------------------------------------------------------------ | ------- |
| `page`             | positive integer                                                   | `1`     |
| `limit`            | integer `1`..`100`                                                 | `10`    |
| `search`           | case-insensitive text over candidate name, company, location, type | -       |
| `status`           | `PENDING` \| `IN_PROGRESS` \| `COMPLETED` \| `FAILED`              | -       |
| `riskLevel`        | `LOW` \| `MEDIUM` \| `HIGH`                                        | -       |
| `verificationType` | `Employment` \| `Education` \| `Identity` \| `Address` \| `Criminal` | -     |
| `delay`            | integer `0`..`10000` (milliseconds)                                | `API_DELAY_MS` |

Filters may be combined, e.g. `?page=1&limit=10&status=COMPLETED&delay=3000`. Any invalid value
returns `400`; an unknown `userId` parameter is ignored, because access is always decided from the
JWT.

### Examples

```bash
# Sign in
curl -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"userId":"admin001","password":"Admin@123","role":"ADMIN"}'
```

```jsonc
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "tokenType": "Bearer",
    "expiresInSeconds": 3600,
    "issuedAt": "2026-10-07T06:18:41.113Z",
    "user": {
      "id": "USR-001", "userId": "admin001", "name": "System Administrator",
      "email": "admin@mploychek.local", "role": "ADMIN",
      "department": "Administration", "status": "ACTIVE",
      "createdAt": "2026-10-01T10:00:00.000Z"
    }
  },
  "meta": { "requestId": "…", "timestamp": "…", "durationMs": 41, "delayMs": 0 }
}
```

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"userId":"admin001","password":"Admin@123","role":"ADMIN"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

# Create a user (ids are allocated by the repository: USR-003)
curl -X POST http://localhost:3000/api/users -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"userId":"persist01","name":"Persistence Probe","email":"probe@mploychek.local",
       "password":"Str0ng@Pass","role":"GENERAL_USER","department":"Compliance"}'

# Records (an admin sees all; a general user sees only their assigned records)
curl "http://localhost:3000/api/records?page=1&limit=10" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3000/api/records?status=COMPLETED&riskLevel=HIGH" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3000/api/records?search=tech" -H "Authorization: Bearer $TOKEN"

# Simulate a slow call: the response is delayed ~3s without blocking the event loop
curl "http://localhost:3000/api/records?delay=3000" -H "Authorization: Bearer $TOKEN"

# One record - 403 if it is not assigned to the caller, 404 if it does not exist
curl http://localhost:3000/api/records/REC-001 -H "Authorization: Bearer $TOKEN"
```

### Status codes

| Code  | When                                                                                 |
| ----- | ------------------------------------------------------------------------------------ |
| `200` | Successful read/update/login                                                          |
| `201` | A user was created                                                                    |
| `400` | Body fails validation (`VALIDATION_ERROR`, with a per-field breakdown)                 |
| `401` | Wrong password, unknown user, or a missing / malformed / expired / foreign token        |
| `403` | Valid credentials but the wrong role, an inactive account, or a role that is not allowed |
| `403` | Authenticated but not authorized - a record not assigned to the caller, or a forbidden role |
| `404` | Unknown route, unknown user id, or a record id that does not exist                     |
| `409` | Duplicate `userId`/`email`, or an administrator targeting their own account            |
| `413` | Body larger than `JSON_BODY_LIMIT`                                                     |
| `500` | Unexpected failure or a corrupted data file (details logged, never returned)           |

## Security notes

- **Passwords never leave the server.** Responses are built by `toPublicUser()`, which copies fields
  explicitly instead of spreading, so `passwordHash` cannot leak - not even if `User` gains fields
  later. `id` and `passwordHash` are also absent from the request schemas, so a client cannot inject
  either (zod strips unknown keys; there are tests for it).
- **bcrypt, not plain text, not a reversible encoding.** Digests are `$2b$10$…` and verified with
  `bcrypt.compare`; a malformed digest behaves like a wrong password rather than throwing.
  Legacy `scrypt$…` digests from an earlier iteration are still verifiable, so an upgrade does not
  lock anyone out - `npm run seed` re-hashes them as bcrypt.
- **No user enumeration.** An unknown user id still runs a password comparison against a cached
  placeholder digest and returns a byte-identical 401 to a wrong password.
- **Forge-proof authorisation.** `authenticate()` re-reads the user on every request, so a role
  change or a deactivation applies immediately; a token with a tampered `role` claim cannot escalate
  privileges (asserted by a test).
- **Records are scoped to the authenticated user on the server.** A general user is served only
  rows whose `assignedUserId` equals their own `id`; a `userId` query parameter is never consulted.
  Requesting somebody else's record by id answers `403`, so the frontend can never be the only thing
  standing between a user and another user's data.
- **Production guardrails.** `NODE_ENV=production` refuses to boot with a missing, placeholder or
  shorter-than-32-character `JWT_SECRET`.

## Configurable API delay

The delay demonstrates asynchronous processing and is part of the records API.

- `API_DELAY_MS` in `.env` sets the default latency for **every** `/api` request (`0` = off).
- `?delay=<ms>` (alias `?delayMs=`) overrides it per request. The value is **validated**: only
  integers in `0..10000` are accepted, anything else answers `400 INVALID_DELAY` with the message
  `Delay must be between 0 and 10000 milliseconds`.
- The wait is `await delay(ms)` - a promise around `setTimeout` - so it never blocks the event loop;
  other requests are served while one waits.

```bash
curl "http://localhost:3000/api/records?delay=3000"      # ~3s, meta.delay = 3000
curl "http://localhost:3000/api/records?delay=abc"       # 400 INVALID_DELAY
```

## Layout

```
src/
├── app.ts                  createApp(): middleware order + route mounting
├── server.ts               seed, listen, graceful shutdown, process hooks
├── scripts/seed.ts         `npm run seed`
├── config/                 env.config.ts - validated, frozen, typed configuration
├── repositories/           the only layer that touches fs and JSON
│   ├── json.repository.ts  JsonCollectionRepository<T>: queue, atomic writes, safe parsing
│   ├── user.repository.ts  findByUserId / findById / findAll / create / update / updateStatus / delete
│   └── record.repository.ts findAll / findById / findByUserId / count / filter / paginate
│                            (+ bulk write for the seeder)
├── services/               business logic (no Express imports, no fs imports)
├── controllers/            HTTP <-> service translation only
├── routes/                 routers, aggregated in routes/index.ts
├── middleware/             request context, api delay, access log, auth, validation, 404, errors
├── models/                 domain types, envelope contract, PublicUser mapper
├── validation/             zod request schemas
└── utils/                  ApiError, password hashing, AsyncQueue, logger, response helpers
```

Layering rule: `routes → controllers → services → repositories → JSON file`, with
`utils`/`models`/`validation` as leaves. Only `routes`, `controllers`, `middleware` and `repositories`
may import Express or `fs` respectively - services import neither.

## Tests

```bash
npm test
```

Runs with `--env-file=.env.test`, so the suite uses `backend/data/.test/` and never touches your
development data, and with `--test-concurrency=1` to keep each file's store deterministic.

| Suite                           | Covers                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `tests/repository.test.ts`      | Missing directory/file, empty file, malformed JSON, non-array document, invalid entry, read failure, write failure, id allocation, concurrent creates, duplicates |
| `tests/persistence.test.ts`     | Document shape (users + records), and that login, creation, update, deactivation, deletion and record queries all survive a restart |
| `tests/users.admin.test.ts`     | RBAC (403/401), listing, create/update/status/delete, duplicate 409s, empty-patch 400, hash-on-the-way-in, injected `id`/`passwordHash` ignored, self-protection |
| `tests/records.test.ts`         | RBAC (own vs all, `403` for another user's record), filtering, search, pagination, delay (0/1000/3000/5000), non-blocking proof, invalid delay/pagination, token required |
| `tests/auth.test.ts`            | Login 200/400/401/403, password never serialised, `/api/users/me`, missing/malformed/foreign/expired token |
| `tests/auth.middleware.test.ts` | `authorize()` / `requireAdmin()`: 403 for the wrong role, 401 when unauthenticated          |
| `tests/error-handler.test.ts`   | 500 envelope without a stack trace, malformed JSON → 400, framework status passthrough      |
| `tests/health.test.ts`          | Health endpoint, CORS and the configurable delay                                           |

## Adding a feature (next phases)

1. Add types to `src/models/` and a zod schema to `src/validation/`.
2. Add logic to `src/services/` (no Express, no `fs`); extend the relevant repository if new
   persistence is needed.
3. Add a thin controller in `src/controllers/`.
4. Add a router in `src/routes/` (chain `validateBody`, `authenticate`, `authorize`) and mount it in
   `src/routes/index.ts`.

`app.ts` never changes: it only knows the mounted prefix and the middleware order.
