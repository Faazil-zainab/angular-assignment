# Screenshots

These are **genuine captures of the running application** — produced by driving the locally installed
Chrome in headless mode over the DevTools Protocol. Nothing here is a mock-up, a template or a
redrawn design.

## The files

| File | Screen | How it is reached | Size |
| ---- | ------ | ----------------- | ---- |
| `01-login.png` | Sign-in page (brand panel + sign-in card) | `/auth/login` | 1440 × 1000 |
| `02-dashboard-general-user.png` | Dashboard as a General User — only their own 10 records | sign in as `user001` / `User@123` | 1440 × 1635 |
| `03-dashboard-admin.png` | Dashboard as an Admin — all 16 records, plus admin-only panels | sign in as `admin001` / `Admin@123` | 1440 × 1947 |
| `04-admin-user-management.png` | Admin user management (filters, table, actions) | `/admin/users` as admin | 1440 × 1000 |
| `05-api-loading-state.png` | API loading state — skeleton rows while the records request is in flight | dashboard, response held open | 1440 × 1000 |
| `06-dashboard-tablet.png` | Responsive layout at tablet width, sidebar collapsed to a drawer | dashboard at 768 × 1024 | 768 × 1024 |
| `07-dashboard-mobile.png` | Responsive layout at mobile width | dashboard at 390 × 844 | 390 × 844 |

## How to regenerate them

`capture.mjs` in this directory does the work. It adds **no dependencies**: it uses Node's built-in
`fetch` and `WebSocket`, a ~40-line static file server, and the Chrome already on the machine.

```bash
# 1. API (from backend/, so the JSON store resolves to backend/data)
npm --prefix backend run build
cd backend && node dist/server.js          # :3000

# 2. SPA built with the development configuration (apiBaseUrl -> http://localhost:3000)
npm --prefix frontend run build -- --configuration development

# 3. Capture (from the repository root)
node docs/screenshots/capture.mjs
```

Chrome is looked up in its default install location; add a path to `CHROME_CANDIDATES` if yours
differs. The script signs in through the real `POST /api/auth/login` endpoint, so the API must be
running and seeded.

## It also verifies the interface

Because a screenshot can only suggest whether a layout is correct, the same run measures the things
that matter and prints a pass/fail line for each. Every check currently passes:

- **Responsive layout** — the sidebar is docked at 1440 px and becomes an overlay drawer at 768 px and
  390 px; the page never scrolls sideways; the KPI grid reflows 5 → 3 → 1 columns.
- **Accessibility** — every form control has an accessible name, every button has a label, `Tab`
  reaches interactive elements in order, keyboard focus matches `:focus-visible`, and focus is
  *visibly* indicated (proved by diffing rendered pixels of each control while unfocused versus
  focused, with animations, transitions and the caret neutralised).
- **Contrast** — every rendered text element is compared against its nearest opaque background, and
  must meet WCAG AA (4.5:1, or 3:1 for large text). ~200 elements are sampled per page.

The checks exit non-zero on failure, so this doubles as a smoke test for the built application.

## Method notes and limitations

- Screenshots are full-page (the viewport is expanded to the document height) except the responsive
  and loading-state shots, which are viewport-sized.
- `prefers-reduced-motion: reduce` is emulated, so entrance animations are not caught mid-flight.
- The contrast audit resolves solid backgrounds only; it cannot judge text over gradients or images,
  and it does not evaluate disabled-state colours.
- Focus-indicator detection is pixel-based, so it proves *that* something changed on focus, not that
  the indicator has a specific size or meets a contrast ratio on its own.
