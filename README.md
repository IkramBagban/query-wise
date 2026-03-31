# QueryWise

QueryWise is a conversational BI app for PostgreSQL.  
Connect a database (demo or custom), ask questions in natural language, and get:
- generated SQL,
- query results,
- auto-selected charts,
- and dashboard widgets that can be shared by link.

## Tech Stack
- Next.js 16 (App Router, API routes)
- TypeScript
- PostgreSQL (`pg`)
- AI SDK with Google + Anthropic providers
- Recharts

## Repository
- GitHub: [ikramBagban/query-wise](https://github.com/ikramBagban/query-wise/)

## Prerequisites
- Node.js 20+
- Bun (recommended in this repo) or npm
- A PostgreSQL database for demo seeding (`DEMO_DATABASE_URL`)
- One LLM API key from either:
  - Google AI Studio (Gemini), or
  - Anthropic (Claude)

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

Required variables:
```env
DEMO_DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require
DEMO_USERNAME=demo
DEMO_PASSWORD=querywise
NEXTAUTH_SECRET=your-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Notes:
- This project’s convention is `.env` as the single local env file.

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

Sign in with your configured demo credentials:
- username: `DEMO_USERNAME`
- password: `DEMO_PASSWORD`

## 5) Use the product
1. Open Workspace.
2. Connect to Demo DB (or connect your own PostgreSQL connection string).
3. In Settings, choose provider + model and paste your own API key.
4. Ask natural-language data questions.
5. Save useful results to dashboard widgets and share links.

## Build check
```bash
npm run build
```

