# WINGTRACK — Integrated POS, Inventory & Sales Analytics

> Built for **Wingtrack** | React + Node.js/Express + Supabase (PostgreSQL)

---

## Project Structure

```
WINGTRACK Website Design/
├── client/        # React 19 + Vite + Tailwind CSS v4 (frontend)
├── server/        # Express.js + TypeScript (backend API)
├── supabase/      # schema.sql — run this in Supabase SQL Editor
└── package.json   # Root dev scripts (runs both client + server)
```

---

## Quick Start

### 1. Set Up Supabase
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Open the **SQL Editor** and run the contents of [`supabase/schema.sql`](./supabase/schema.sql).
3. This creates all tables, enums, RLS policies, recipes, and seed data.

### 2. Configure Environment Variables

**Client** — copy and fill in:
```bash
cp client/.env.example client/.env.local
```

**Server** — copy and fill in:
```bash
cp server/.env.example server/.env
```

Keys to fill in (from Supabase Project Settings → API):
| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon / public key |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (keep secret!) |
| `SUPABASE_JWT_SECRET` | Project Settings → API → JWT Settings |

### 3. Install Dependencies
```bash
npm install          # installs root concurrently
npm run install:all  # installs client + server packages
```

### 4. Create the First Admin Account
Since public sign-up is disabled, the first admin must be created **directly in Supabase**:
1. Go to **Authentication → Users → Add User** in the Supabase dashboard.
2. Then run this SQL in the SQL Editor (replace the values):
```sql
INSERT INTO public.staff_profiles (user_id, full_name, email, role)
VALUES (
  '<paste-user-id-from-auth-dashboard>',
  'Manager Name',
  'admin@wingtrack.ph',
  'admin'
);
```

### 5. Run the Application
```bash
npm run dev
```
- **Client:** http://localhost:5173
- **Server:** http://localhost:4000
- **API Health:** http://localhost:4000/api/health

---

## Role Access Matrix

| Role | Dashboard | POS | Inventory | Analytics | Staff Manager |
|---|---|---|---|---|---|
| Admin / Manager | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cashier | — | ✅ | — | — | — |
| Inventory Personnel | — | — | ✅ | — | — |

---

## How Checkout Works

```
Cashier clicks "Charge" 
  → Client sends POST /api/checkout (with JWT)
    → Express verifies JWT + role
      → Loads product recipes from DB
        → Aggregates ingredient deductions
          → Updates inventory.stock_qty for each ingredient
            → Logs every change to inventory_movements
              → Returns order confirmation to client
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS v4, TypeScript |
| Charts | Recharts |
| Backend | Node.js, Express 4, TypeScript |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Auth | Supabase Auth (JWT) |
| Fonts | Fraunces, DM Sans, DM Mono (Google Fonts) |
