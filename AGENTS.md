# wingtrack

React + Vite + Tailwind CSS frontend in `client/`, Express + TypeScript API in `server/`, Supabase (PostgreSQL) for data.

## Canonical source layout

**`client/` is the single source of truth for all frontend code.** The repository root holds only orchestration files (root `package.json`, docs, `supabase/`) — it contains **no** `src/`, `index.html`, or Vite config of its own.

```
WINGTRACK Website Design/
├── client/              # React 19 + Vite 8 + Tailwind v4  ← all frontend code
│   ├── index.html       # Vite entry shell
│   ├── src/             # App.tsx, components/, pages/, hooks/, lib/, types/
│   ├── public/          # Static assets (logo.png)
│   ├── vite.config.ts   # Vite config + /api proxy → localhost:4000
│   └── tsconfig.json
├── server/              # Express 4 + TypeScript API (routes/, middleware/, lib/)
├── supabase/schema.sql  # Run in Supabase SQL Editor
└── package.json         # Root orchestrator (delegates to client/ and server/)
```

Do not re-create a root-level `src/` or `vite.config.ts` — that duplication was removed deliberately. Edit files under `client/src/`.

## Development Server

A Vite development server is running on **http://localhost:5173** (started from `client/`). The Express API runs on **http://localhost:4000**.

- Preview URL: access the running app through the preview panel
- Hot reload: changes to `client/src/` are reflected immediately
- API calls to `/api/*` are proxied by Vite to `http://localhost:4000`

### Commands (run from the repository root)

| Command | Effect |
|---|---|
| `npm run dev` | Runs client + server together via concurrently |
| `npm run dev:client` | Vite dev server on :5173 |
| `npm run dev:server` | Express API on :4000 |
| `npm run build` | Typecheck + production build of `client/` |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | `tsc -b` over `client/` |

## Project Structure (client/src)

- `main.tsx` — React entrypoint; imports `index.css` and mounts `App.tsx` into `#root`
- `App.tsx` — Top-level auth router (login / signup / otp / forgot / reset → AppShell)
- `index.css` — Tailwind v4 import, theme tokens, font wiring
- `components/layout/AppShell.tsx` — Authenticated shell; role-gated page switching
- `components/layout/Sidebar.tsx` — Navigation, role filtering, password & sign-out modals
- `components/auth/*` — Login, SignUp, OTP, ForgotPassword, ResetPassword
- `components/cashier/*` — CashPaymentCalculator, PayMongoModal
- `components/receipt/ReceiptModal.tsx` — Printable receipt
- `pages/admin/*` — Dashboard, Analytics, MenuManager, StaffManager
- `pages/cashier/PointOfSale.tsx` — POS with cart + inventory-aware checkout
- `pages/inventory/Inventory.tsx` — Stock levels, adjustments, movement audit log
- `pages/orders/OrdersList.tsx` — Transaction history and void
- `hooks/useAuth.tsx` — Supabase auth context (session, profile, role)
- `lib/supabase.ts` — Supabase browser client
- `lib/api.ts` — Typed wrappers around the Express API
- `types/index.ts` — Shared TypeScript types

## Dependencies

- Runtime: React 19, React DOM 19, react-router-dom 7, Recharts 3, `@supabase/supabase-js` 2
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `client/vite.config.ts`. `client/src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customisation in `client/src/index.css`. No Tailwind config file or PostCSS config is needed.

`client/src/main.tsx` imports `client/src/index.css`, so global font wiring belongs in `client/src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

## Security notes

- `server/.env` holds `SUPABASE_SERVICE_ROLE_KEY` — it bypasses RLS and must never reach the client.
- Client-exposed values go in `client/.env.local` (`VITE_*` only).
- `.env`, `.env.local`, `dist/`, and `node_modules/` are gitignored — keep build output out of version control.
