# Screenshots — capture instructions

> ⚠️ **These are placeholders, not real screenshots.**
>
> Browser-automation tooling (Puppeteer / Playwright) is **not installed** in this repository, so the
> PNG files referenced from the root README do not exist yet. Nothing here is a fabricated capture.

## Why they are not committed

The images below can be produced in a minute from the running application, but generating (or
committing) binary screenshots from an agent session would either require adding a heavy automation
dependency (against the "no unnecessary dependencies" rule) or risk presenting a mock-up as a real
capture. The honest choice is to document exactly how to capture them.

## How to capture

1. Start both applications from the repository root:

   ```bash
   npm install
   npm run dev          # API on :3000, SPA on :4200
   ```

2. Open <http://localhost:4200> in a Chromium-based browser at a desktop width (e.g. 1440 × 900).

3. Use the browser's built-in screenshot tool (DevTools → **Capture screenshot**, or
   `Ctrl/Cmd + Shift + P` → *Capture full size screenshot*).

| # | Screen                     | How to reach it                                                        | Suggested file                         |
| - | -------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| 1 | Login                      | Open `/auth/login` (the app lands here when signed out)                 | `01-login.png`                         |
| 2 | General user dashboard     | Sign in as `user001` / `User@123` → **General User**                    | `02-dashboard-general-user.png`        |
| 3 | Admin dashboard            | Sign in as `admin001` / `Admin@123` → **Admin**                         | `03-dashboard-admin.png`               |
| 4 | User management            | As admin, open **Administration → Users** (`/admin/users`)              | `04-user-management.png`               |
| 5 | API loading state          | On the dashboard select the **3 seconds** API-delay option, then capture while the skeleton rows are visible | `05-loading-state.png` |

4. Drop the files into this directory using the suggested names, then update the status column of the
   **Screenshots** table in the [root README](../../README.md#screenshots) from *Placeholder* to *Captured*.

## Mobile / tablet captures (optional)

Resize the browser (or use device emulation) to ~390 px and ~768 px wide to demonstrate the
responsive layout: the sidebar collapses to an overlay drawer, the KPI grid reflows and the records
table scrolls horizontally.
