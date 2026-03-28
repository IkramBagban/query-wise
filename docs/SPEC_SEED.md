# SPEC_SEED — Agent S

> Read CONTEXT.md fully before starting. You are Agent S.
> Agent B1 and B2 handle all backend API logic. Agent F handles all UI.
> Your job: create shared types, utilities, and seed the demo database.

---

## Your Responsibility

You own exactly three things:
1. `types/index.ts` — shared TypeScript types (all agents import from here)
2. `lib/utils.ts` — shared utility functions
3. `scripts/seed.ts` — populates the Neon demo database with realistic ecommerce data

You also create:
- `package.json` with all dependencies
- `tsconfig.json`
- `next.config.ts`
- `tailwind.config.ts`
- `postcss.config.mjs`
- `.env.example`

---

## Step 1 — Project Config Files

### `package.json`
```json
{
  "name": "querywise",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "seed": "npx tsx scripts/seed.ts",
    "lint": "eslint"
  },
  "dependencies": {
    "next": "16.2.1",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "@base-ui/react": "^1.3.0",
    "shadcn": "^4.1.1",
    "tw-animate-css": "^1.4.0",
    "pg": "^8.13.1",
    "ai": "^5",
    "@ai-sdk/google": "^2",
    "@ai-sdk/anthropic": "^2",
    "recharts": "^2.13.3",
    "@faker-js/faker": "^9.2.0",
    "zod": "^3.23.8",
    "lucide-react": "^1.7.0",
    "nanoid": "^5.0.8",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.5.0",
    "class-variance-authority": "^0.7.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/pg": "^8.11.10",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "tsx": "^4.19.2",
    "typescript": "^5",
    "eslint": "^9",
    "eslint-config-next": "16.2.1"
  }
}
```

### `tsconfig.json`
Strict mode, paths alias `@/*` → `./*`, moduleResolution bundler, jsx preserve.

### `next.config.ts`
```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"]
}
export default nextConfig
```

### `tailwind.config.ts`
- Tailwind v4 is used. Keep global styles in `app/globals.css`.
- If you add `tailwind.config.ts`, content should include root-level folders: `app`, `components`, `lib`, `hooks`, `types`.
- Extend theme with the design system colors from CONTEXT.md (map them to Tailwind color names)
- Add `fontFamily` for `syne`, `inter`, `jetbrains`
- Add custom animations: `fade-in`, `slide-up`, `pulse-soft`

### `.env.example`
```
DEMO_DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
DEMO_USERNAME=demo
DEMO_PASSWORD=querywise2024
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 2 — `types/index.ts`

Copy the exact type definitions from CONTEXT.md (the full TypeScript block).
Do not add or remove any types. All agents import from this file.
Add JSDoc comments explaining each major interface.

---

## Step 3 — `lib/utils.ts`

Create these utility functions that multiple agents will use:

```typescript
// cn() — Tailwind class merging
export function cn(...inputs: ClassValue[]): string

// formatNumber() — "1234567" → "1,234,567"
export function formatNumber(n: number): string

// formatDuration() — 1523 → "1.5s"
export function formatDuration(ms: number): string

// formatBytes() — not needed but keep for future

// isDateColumn() — checks if column name/type looks like a date
// checks: column name contains "date","time","at","created","updated"
// OR type is "timestamp","date","timestamptz"
export function isDateColumn(name: string, type: string): boolean

// isNumericColumn() — type is numeric/integer/decimal/float/bigint etc
export function isNumericColumn(type: string): boolean

// generateId() — nanoid wrapper, 10 chars
export function generateId(): string

// truncateSql() — for display, max 120 chars with ellipsis
export function truncateSql(sql: string): string

// sleep() — for retry delays
export function sleep(ms: number): Promise<void>
```

---

## Step 4 — `scripts/seed.ts`

This is the most important file you own. It must:
1. Connect to `DEMO_DATABASE_URL` from `.env.local`
2. Drop and recreate all tables
3. Insert realistic fake data using `@faker-js/faker`
4. Print progress as it runs

### Database Schema to Create

```sql
-- Categories (8 rows)
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
);

-- Customers (500 rows)
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(50),
  country VARCHAR(50) DEFAULT 'US',
  segment VARCHAR(50), -- 'retail', 'wholesale', 'enterprise'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Products (120 rows)
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  cost DECIMAL(10,2) NOT NULL,
  sku VARCHAR(100) UNIQUE,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- Orders (10,000+ rows)
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  status VARCHAR(50) NOT NULL, -- 'pending','processing','shipped','delivered','cancelled','refunded'
  total_amount DECIMAL(10,2) NOT NULL,
  shipping_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  payment_method VARCHAR(50), -- 'credit_card','paypal','bank_transfer'
  created_at TIMESTAMP NOT NULL,
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP
);

-- Order Items (30,000+ rows, avg 3 per order)
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL
);

-- Reviews (3,000 rows, not every customer/order has one)
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  product_id INTEGER REFERENCES products(id),
  order_id INTEGER REFERENCES orders(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  title VARCHAR(255),
  body TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Data Generation Rules

**Categories (8 fixed):**
Electronics, Clothing, Home & Garden, Sports & Outdoors, Books, Beauty & Health, Toys & Games, Food & Beverage

**Customers (500):**
- Realistic names/emails via faker
- States: weight toward CA, TX, NY, FL, WA (60%), rest random US states
- Segments: 60% retail, 30% wholesale, 10% enterprise
- Created dates: spread over last 18 months

**Products (120):**
- 10-20 per category
- Price ranges per category:
  - Electronics: $29–$1,499
  - Clothing: $15–$250
  - Home & Garden: $12–$599
  - Sports: $20–$499
  - Books: $8–$60
  - Beauty: $10–$120
  - Toys: $8–$200
  - Food: $5–$80
- cost = price * random(0.35, 0.65)
- Realistic product names per category (don't just use faker.commerce.product)

**Orders (10,000):**
- Spread across last 12 months with realistic seasonality:
  - November/December: 2.5x normal volume (holiday)
  - January: 0.7x (post-holiday slump)
  - Other months: 1x base
- Status distribution: 65% delivered, 15% shipped, 10% processing, 5% pending, 3% cancelled, 2% refunded
- total_amount: sum of order_items (calculate after items are created, or generate items first)
- shipping_amount: 0 for orders > $75, else $5.99–$12.99
- discount_amount: 20% of orders have a discount (5–25% off)
- payment_method: 55% credit_card, 30% paypal, 15% bank_transfer

**Order Items:**
- 1–5 items per order (weighted: 1=15%, 2=30%, 3=30%, 4=15%, 5=10%)
- Pick random products, set unit_price = product.price at time of order
- total_price = quantity * unit_price

**Reviews:**
- ~30% of delivered orders get a review
- Rating distribution: 5★=45%, 4★=30%, 3★=15%, 2★=7%, 1★=3%
- Generate short title and body using faker

### Seed Script Structure

```typescript
import { faker } from "@faker-js/faker"
import { Pool } from "pg"
import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const pool = new Pool({ connectionString: process.env.DEMO_DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function main() {
  console.log("🌱 Starting seed...")
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await dropTables(client)
    await createTables(client)
    const categoryIds = await seedCategories(client)
    const customerIds = await seedCustomers(client)
    const productIds = await seedProducts(client, categoryIds)
    await seedOrdersAndItems(client, customerIds, productIds)
    await seedReviews(client, customerIds, productIds)
    await client.query("COMMIT")
    console.log("✅ Seed complete!")
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("❌ Seed failed:", err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
```

Use batched inserts (INSERT with multiple value rows, 100 at a time) for performance. Do not insert one row at a time.

---

## Completion Checklist

- [ ] All config files created
- [ ] `types/index.ts` matches CONTEXT.md exactly
- [ ] `lib/utils.ts` exports all listed functions with correct types
- [ ] `scripts/seed.ts` runs without errors
- [ ] After seed: categories=8, customers=500, products=120, orders≥10000, order_items≥25000, reviews≥2500
- [ ] Seed is idempotent (can run twice without errors — drops and recreates)
- [ ] All dates are realistic (not all the same, spread across 12 months)
- [ ] No TypeScript errors (`npx tsc --noEmit`)

