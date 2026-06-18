# QueryWise

QueryWise is a conversational BI app for PostgreSQL.  
Connect a database (demo or custom), ask questions in natural language, and get:
- generated SQL,
- query results,
- auto-selected charts,
- and dashboard widgets that can be shared by link.

Current implementation note: the primary app routes use the V2 workspace with
Clerk authentication and persisted product data. Some legacy demo routes still
exist for the original fixed-login flow, but they are not the primary access
path.

## Demo Video
Watch the full walkthrough: [QueryWise Demo](https://drive.google.com/file/d/1w-UEfbPXw0Xy9DFsrJ_dpld1Ib2lnjL9/view?usp=sharing)

[![Watch the demo](https://drive.google.com/thumbnail?id=1w-UEfbPXw0Xy9DFsrJ_dpld1Ib2lnjL9)](https://drive.google.com/file/d/1w-UEfbPXw0Xy9DFsrJ_dpld1Ib2lnjL9/view?usp=sharing)

## 1) Clone and install
```bash
git clone https://github.com/ikramBagban/query-wise.git
cd query-wise
bun install
```

If you prefer npm:
```bash
npm install
```

## 2) Configure environment
Create `.env` in the project root.

You can start from:
```bash
cp .env.example .env
```

Required for the current V2 app:
- `QUERYWISE_APP_DATABASE_URL`
- Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- encryption/signing keys listed in `.env.example`
- `DEMO_DATABASE_URL` if you want the pre-seeded demo database experience

## 3) Seed the demo database
```bash
npm run seed
```

What this creates:
- ecommerce schema with customers, products, orders, order items, categories, reviews
- 10K+ orders over the last 12 months

## 4) Run the app
```bash
npm run dev
```

Open:
- [http://localhost:3000](http://localhost:3000)

Sign in through Clerk on `/sign-in`. The legacy `/signin` username/password
route still exists for old demo code, but the V2 app is protected by Clerk.

## 5) Use the product
1. Open Chats or Connections from the V2 navigation.
2. Add a PostgreSQL connection, or use the configured demo database path.
3. In Settings, choose provider + model and paste your own API key.
4. Ask natural-language data questions.
5. Save useful results to dashboard widgets and share links.

## Current gaps
- Example assignment queries still need recorded verification against a seeded demo database.
- Deployment status and hosted demo database availability are not proven by this repo alone.
- Legacy fixed username/password auth is not the primary auth system; Clerk is.

## Build check
```bash
npm run build
```

