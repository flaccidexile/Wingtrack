# System Audit: Required Changes

**System:** WINGTRACK — Integrated Point-of-Sale, Inventory Management & Sales Analytics (Wing's Zone)
**Audit date:** 10 October 2026
**Environment:** Local desktop — frontend `http://localhost:5173`, API `http://localhost:4000`
**Test account:** `admin@admin.com` (role: admin)
**Method:** Live API probing with a real admin JWT, plus automated UI traversal at three viewports (1440×900 desktop, 820×1180 tablet, 390×844 mobile) capturing console errors, failed requests, and per-element viewport overflow.

> **Audit integrity note.** Every probe was performed against the live application. Three database artifacts created during testing (2 orphaned orders and 1 completed order with its inventory movements) were fully reversed, and one accidentally-created staff account was deleted. Final state verified identical to baseline: **29 orders, 0 orphans, 15 products, BBQ Sauce at 30.65.** No source files were modified and nothing was pushed.

---

## Executive Summary

The application's **core data layer is sound** — all 10 API endpoints return 200, every page renders with **zero console errors and zero failed network requests** across all three viewports, validation exists on the inventory and product routes, and the void/receipt flows are correctly guarded.

The problems cluster in **three areas**: (1) the checkout endpoint has no input validation and no transaction, so it can permanently corrupt sales data; (2) the inventory audit log silently discards write failures, causing stock and its history to diverge; and (3) the UI is **effectively unusable below ~1200px** because a fixed 280px sidebar never collapses.

| Severity | Count | Theme |
|---|---|---|
| Critical | 3 | Data corruption, silent audit-trail loss, mobile-blocking layout |
| UX & Design | 8 | Blocking dialogs, no error boundary, mislabeled nav, no skeletons |
| Forms & Inputs | 6 | Missing validation, inconsistent password rules, error leakage |

---

## 1. Critical Changes (Fix Instantly)

### 1.1 — Checkout accepts negative, zero, and fractional quantities; writes corrupt orders

**Severity: CRITICAL — corrupts financial data**

`POST /api/checkout` performs **no runtime validation on `quantity`**. The handler destructures the body with a TypeScript type assertion:

```ts
// server/src/routes/checkout.ts:20-24
const { items, payment_method, notes } = req.body as {
  items: { product_id: string; quantity: number }[]
  payment_method: 'cash' | 'gcash' | 'card'
  notes?: string
}
```

A type assertion is erased at compile time — it does nothing at runtime.

**Reproduction (verified):**

```bash
POST /api/checkout
{"items":[{"product_id":"<valid-uuid>","quantity":-5}],"payment_method":"cash"}
```

**Observed result — a persisted, corrupted order:**

```json
{
  "order_number": 30,
  "status": "completed",
  "subtotal": -1495,
  "vat_amount": -179.4,
  "total_amount": -1674.4,
  "order_items": []
}
```

A **negative revenue order** was written with `status: "completed"` and zero line items. The API returned `500 "Failed to save order items."` — but only *after* the order header had already been committed.

Confirmed variants:
- `quantity: 0` → 500, orphaned order with `total_amount: 0`
- `quantity: 1.7` → 500, orphaned order with `total_amount: 569.3`
- `quantity: "5"` (string) → **silently accepted**, created a real order and deducted stock

**Why this must change:** negative and fractional totals flow directly into the Dashboard and Analytics aggregates. If a cashier's client is manipulated (or a future UI bug emits a bad value), revenue figures are permanently wrong with no error surfaced. Order #30 also demonstrates the failure mode is *invisible* — the UI showed a generic error while the bad record stayed in the database.

**Required fix:**
1. Reject any item where `typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1`.
2. Reject a `payment_method` outside the allowlist.
3. Return `400` with a field-specific message *before* touching the database.

---

### 1.2 — Checkout is not transactional; partial failures leave orphaned orders

**Severity: CRITICAL — data integrity**

`checkout.ts` performs four sequential, independent writes with **no transaction and no compensating rollback** (grep for `rollback`/`transaction`/`rpc(` returns nothing):

1. Insert `orders` header
2. Insert `order_items`
3. Update `inventory` stock levels
4. Insert `inventory_movements`

If step 2, 3, or 4 fails, the earlier writes **remain committed**. This is precisely what produced the three orphaned orders above — each had a header with no line items.

**Compounding effect:** orders with no `order_items` still appear in Order History and are counted by analytics, so a failed checkout silently inflates the order count while contributing zero (or negative) revenue.

**Required fix:** wrap the entire operation in a Postgres function (`rpc`) executed as a single transaction, or add explicit compensating deletes on any downstream failure. A `BEGIN … COMMIT` boundary is the only correct answer here; sequential REST calls cannot be made atomic.

---

### 1.3 — The mobile layout is unusable; content is clipped with no way to reach it

**Severity: CRITICAL — blocks all mobile/tablet use**

The app has **zero responsive adaptation**:
- **0** `@media` queries (only a `@media print` block in Inventory)
- **0** Tailwind responsive prefixes (`sm:`/`md:`/`lg:`) — despite Tailwind v4 being installed
- **0** `matchMedia` / `useMediaQuery` usage
- **956** inline `style={{...}}` objects, which cannot respond to viewport changes without JS

The sidebar is a hard-coded `width: 280` with no collapse behaviour, and page containers use `overflow: hidden`.

**Measured overflow — content right-edge vs. actual viewport (Playwright, authenticated):**

| Page | Mobile viewport | Content right edge | Widest element |
|---|---|---|---|
| Order History | 390px | **1647px** | `DIV` |
| Inventory | 390px | **1169px** | `DIV` |
| Menu Manager | 390px | **1045px** | `TABLE` |
| Staff Manager | 390px | **1040px** | `DIV` |
| Dashboard | 390px | **956px** | `DIV.card` |
| Analytics | 390px | **842px** | `DIV.card` |
| Point of Sale | 390px | **764px** | `DIV` |

**This is worse than a horizontal scrollbar.** Because the layout sets `overflow: hidden`, `document.documentElement.scrollWidth` reports no overflow — the excess content is **clipped and permanently unreachable**. Screenshots confirm:

- **Dashboard (mobile):** the 280px sidebar occupies 72% of the screen; the greeting, stat cards and revenue chart are cut off with no scroll.
- **Point of Sale (mobile):** the cashier sees only the sidebar and slivers of the header — the product grid, cart, and totals are entirely inaccessible. **A cashier on a phone cannot complete a sale at all.**
- **Order History (mobile):** the sidebar dominates; the order table columns are clipped; only `#2…` fragments of order numbers are visible.

**Also note the fixed-column grids** in `Dashboard.tsx` (`repeat(4, 1fr)`, `1fr 380px`) — these will crush rather than reflow. Only the POS product grid uses `auto-fill` (`repeat(auto-fill, minmax(240px, 1fr))`) and is the one genuinely responsive element in the app.

**Required fix:**
1. Make the sidebar a collapsible drawer below ~1024px (`position: fixed` + transform, toggled by a hamburger in the top bar). The off-canvas markup already exists (two `position: fixed` overlays are present in `Sidebar.tsx`) — it is simply never activated.
2. Replace fixed `repeat(N, 1fr)` grids with `repeat(auto-fit, minmax(...))`.
3. Migrate the highest-traffic layouts (POS, Orders, Dashboard) from inline styles to Tailwind responsive classes.
4. At minimum, change `overflow: hidden` to allow scrolling so content is reachable while a proper fix is built.

---

## 2. UX & Design Changes (Recommended Optimizations)

### 2.1 — Native `alert()` / `confirm()` dialogs break the styled UI

**7 call sites** use blocking browser dialogs:

| File | Line | Use |
|---|---|---|
| `StaffManager.tsx` | 66, 71, 76, 81 | Deactivate / reactivate confirm + error alert |
| `MenuManager.tsx` | 231 | Delete-product confirm |
| `PointOfSale.tsx` | 280 | Void-order confirm |
| `App.tsx` | 77 | Offline retry alert |

**Why change:** these cannot be themed, ignore the app's design language, display the raw origin URL on mobile, and are blocked entirely in some embedded/kiosk browsers. They also stop JS execution, which can desync React state. A POS terminal is exactly the environment where a native modal looks most broken.

**Recommendation:** a single reusable `<ConfirmDialog>` / `<Toast>` pair.

### 2.2 — No error boundary anywhere

There is **no `ErrorBoundary`, `componentDidCatch`, or `getDerivedStateFromError`** in the codebase. Any uncaught render error unmounts the entire React tree, leaving a **blank white screen** with no recovery path — during an active sale, that means losing the cart.

**Recommendation:** wrap `<AppShell>` in an error boundary that shows a "reload / return to dashboard" fallback.

### 2.3 — Navigation labels contradict page headings

| Sidebar label | Page heading |
|---|---|
| Transactions | "Order History & Transactions" |
| Menu Items | "Menu Manager" |

Staff must translate between two names for the same screen. Pick one term per concept and use it in both places.

### 2.4 — No skeleton loaders; every page blocks on a bare spinner

No `Skeleton` component exists anywhere. `Dashboard.tsx` swaps the whole content area for a spinner, causing a full-screen layout shift on every load. On a slow connection the cashier sees a blank screen with no indication of what is coming.

**Recommendation:** skeleton placeholders matching final layout dimensions for Dashboard, Orders, and Inventory.

### 2.5 — Order History is capped at 100 records with no pagination

```ts
// server/src/routes/orders.ts:39
.limit(100)
```

Search and filtering are **client-side only** (`OrdersList.tsx` filters the fetched array). Once the store passes 100 orders, order #101 and older become **permanently invisible and unsearchable** — with no "load more", no page controls, and no indication that data is missing. For a POS that records every sale, this limit will be hit quickly.

**Recommendation:** server-side pagination with `range()`, plus a visible result count and paging controls. Add server-side search on order number and date range.

### 2.6 — Password-reset and login flows depend on email that may never arrive

Already documented in the prior session: the project uses Supabase's built-in mailer, which refuses to deliver to non-team addresses and is capped at ~2 messages/hour. A custom SMTP path has been built server-side but **requires `SMTP_*` configuration and the `login_otps` table to be created**. Until then, both OTP login and password reset silently fail to deliver.

### 2.7 — Status feedback for long operations is inconsistent

`PayMongoModal.tsx` has only a single `setTimeout` for status reconciliation and no polling loop, yet payment confirmation is inherently asynchronous. If the redirect-back does not land, the cashier has no way to force a re-check.

**Recommendation:** poll the payment status with backoff, and provide a manual "Check payment status" action.

### 2.8 — Maintainability risk in the largest components

| File | Lines | Inline styles | Notable |
|---|---|---|---|
| `MenuManager.tsx` | 1077 | 115 | ~25 `useState` hooks in one component |
| `Inventory.tsx` | 826 | 109 | |
| `PointOfSale.tsx` | 637 | 71 | |
| `ResetPasswordPage.tsx` | — | 94 | |

`MenuManager` holds all modal, form, category, and banner state in a single component. This is where regressions will originate.

**Recommendation:** extract modal/editing state into custom hooks (`useProductForm`, `useCategoryForm`).

---

## 3. Form & Input Valuations

### 3.1 — Inconsistent minimum password length between creation paths

| Path | Rule | Location |
|---|---|---|
| Admin creates staff | **≥ 6 characters** | `staff.ts:136` |
| Self sign-up | **≥ 8 characters** | `auth.ts:355` |

An admin can create a weaker credential than a user can self-select. **Recommendation:** a single shared constant (≥ 8) enforced in both paths.

### 3.2 — `movement_type` has no allowlist; invalid values are accepted

`PATCH /api/inventory/:id/adjust` accepts any `movement_type` string:

```bash
PATCH /api/inventory/<id>/adjust
{"qty_change":5,"movement_type":"HACK"}
```

**Observed:** returned `200 OK` and changed stock 30.65 → 35.65, but **wrote no movement row** (the database rejected the invalid enum, and the failure was discarded — see 3.3). Stock and audit trail diverged.

**Recommendation:** validate against `['restock','adjustment','waste']` and return `400` otherwise. The route already does exactly this for `qty_change`; the same treatment is missing for `movement_type`.

### 3.3 — Inventory audit-log writes fail silently

```ts
// server/src/routes/inventory.ts:72
await supabaseAdmin.from('inventory_movements').insert({ ... })
```

The result is **not destructured** — neither `data` nor `error` is captured. Any insert failure is discarded and the endpoint still returns `200`. This is the direct cause of 3.2's stock/history divergence.

**Why this matters:** for a government/defense-grade inventory requirement, the audit log is the point of the system. It must never diverge from stock. **Recommendation:** capture the error and return `500`; better, make the stock update and movement insert one transaction.

### 3.4 — Raw database errors are leaked to the client

```ts
// server/src/routes/products.ts:147
res.status(500).json({ message: (err as Error).message || 'Failed to create product.' })
```

Probing with `price: 999999999999` returned a raw Postgres message: **`"numeric field overflow"`**. This exposes schema internals and gives the user nothing actionable.

**Recommendation:** log the raw error server-side; return a generic message with a correlation id. Add an upper bound on `price`.

### 3.5 — No upper bound on product price

Validation covers only `price < 0` (`products.ts:99`). Extremely large values reach the database and produce an unhandled error. **Recommendation:** cap at a sane maximum (e.g. `≤ 1,000,000`) with a clear message.

### 3.6 — Failed requests cannot be retried in-place

`OrdersList` and `MenuManager` show an error message but no retry control. The user must guess to navigate away and back. **Recommendation:** a "Try again" button on every error state — the `loadData` function already exists in each page and can simply be re-invoked.

---

## 4. Actionable Steps

### Fix 1 — Validate checkout input (Critical)
1. Open `server/src/routes/checkout.ts`.
2. After the existing empty-`items` check (~line 26), add:
   - reject non-integer / `< 1` quantities with `400` and the offending index
   - reject `payment_method` outside `['cash','gcash','card']`
3. Move the total recalculation *after* validation so no negative subtotal can be computed.
4. **Verify:** `POST /api/checkout` with `quantity:-5`, `0`, `1.7`, and `"5"` must each return `400` and create **no** order row.

### Fix 2 — Make checkout atomic (Critical)
1. Create a Postgres function `create_order(payload jsonb)` that inserts the header, items, stock updates, and movements in one transaction.
2. Call it from `checkout.ts` via `supabaseAdmin.rpc('create_order', { payload })`.
3. **Verify:** force a failure in the items step and confirm no order header persists.

### Fix 3 — Make the layout responsive (Critical)
1. In `Sidebar.tsx`, default to collapsed below 1024px using a `useMediaQuery` hook; wire the existing off-canvas markup to a hamburger button in the top bar.
2. Replace `repeat(4, 1fr)` and `1fr 380px` in `Dashboard.tsx` (lines 282, 290, 349) with `repeat(auto-fit, minmax(220px, 1fr))`.
3. Remove `overflow: hidden` from page containers so nothing is unreachable while the refactor proceeds.
4. **Verify:** at 390px, every page's widest element must be ≤ 390px (the audit harness in `.audit/ui-audit2.js` reports this automatically).

### Fix 4 — Stop discarding audit-log failures (Critical)
1. In `inventory.ts:72`, capture the error: `const { error: movErr } = await ...`
2. If `movErr`, return `500` and do not report success.
3. Add the `movement_type` allowlist check next to the existing `qty_change` check.
4. **Verify:** `movement_type:"HACK"` returns `400` and changes no stock.

### Fix 5 — Replace native dialogs
1. Build `<ConfirmDialog>` (promise-based) and `<Toast>` components.
2. Replace all 7 `alert`/`confirm` call sites listed in 2.1.

### Fix 6 — Add an error boundary
1. Create `components/ErrorBoundary.tsx`.
2. Wrap `<AppShell>` in `App.tsx` with a fallback offering "Reload" and "Sign out".

### Fix 7 — Paginate Order History
1. Add `limit`/`offset` (or `range`) parameters to `GET /api/orders`.
2. Add paging controls and a total count to `OrdersList.tsx`.
3. Move search server-side once volume warrants it.

### Fix 8 — Unify password policy and input limits
1. Export a shared `MIN_PASSWORD_LENGTH = 8`; use it in `staff.ts` and `auth.ts`.
2. Add a `MAX_PRICE` bound in `products.ts`.

---

## Definition of Done — Verification Status

| Requirement | Status |
|---|---|
| Core workflow tested end-to-end | ✅ All 10 endpoints exercised with a live admin JWT |
| Invalid inputs attempted | ✅ Negative / zero / fractional / string quantities, bad UUIDs, bad enums, overflow values, duplicate emails |
| Console errors inspected | ✅ **0 errors, 0 failed requests** across 3 viewports × 7 pages |
| Desktop + mobile rendering checked | ✅ Automated overflow measurement + screenshots |
| Edge cases explored | ✅ Void idempotency, order-not-found, unregistered email, rate limits |
| Database left intact | ✅ Verified back to baseline: 29 orders, 0 orphans, 15 products |
| Nothing modified or pushed | ✅ No source files changed |

### Known limitation of this audit
The login form is gated behind Cloudflare Turnstile (`disabled={loading || !turnstileToken}`), so headless authentication stalls on a disabled submit button. Authenticated pages were reached by seeding a legitimate Supabase session rather than driving the form. **The login flow itself was therefore not exercised end-to-end in the browser** — it was verified at the API level only. A manual pass on the real login form (including the Turnstile widget appearing and resolving) is recommended as a follow-up. Note also that any environment where `challenges.cloudflare.com` is blocked will leave the sign-in button permanently disabled with no explanatory message — worth adding a visible notice if the widget fails to load.

---

## Appendix — Evidence

- `.audit/ui-report.json` — full 3-viewport traversal results
- `.audit/shots/mobile-*.png` — mobile screenshots per page (dashboard, pos, orders, menu, inventory, analytics, staff, sidebar)
- `.audit/ui-audit2.js` — the reproducible audit harness
- `.audit/shots.js` — screenshot harness

## Appendix — Positive Findings (preserve these)

Worth calling out so a refactor does not regress them:

- **Authorization is solid.** All admin routes correctly require `requireAuth` + `requireRole('admin')`; probing with an expired token returned `401` consistently.
- **Inventory validation is correct** for `qty_change` — the checkout route should follow this existing pattern.
- **Void is properly guarded** — voiding an already-voided order returns `400 "Order is already voided."` with no state change.
- **Stock is floored at zero** (`Math.max(0, currentQty + qty_change)`) and insufficient-stock checkouts are rejected with a clear message naming the short items.
- **Cash payment calculator handles insufficient tender** with a red border, a clear "insufficient" state, and a disabled confirm button — a genuinely good input pattern.
- **Empty states are well written** across Orders, Inventory, Staff, and Menu ("No orders found matching your criteria.", etc.).
- **Zero runtime errors** — no console noise or failed requests in normal operation.
