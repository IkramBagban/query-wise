# QueryWise

QueryWise is a conversational BI app for PostgreSQL.  
Connect a database (demo or custom), ask questions in natural language, and get:
- generated SQL,
- query results,
- auto-selected charts,
- and dashboard widgets that can be shared by link.

## Demo Video
Watch the full walkthrough: [QueryWise Demo](https://drive.google.com/file/d/1w-UEfbPXw0Xy9DFsrJ_dpld1Ib2lnjL9/view?usp=sharing)

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

Sign in with demo credentials:
- username: `demo`
- password: `demo1234`

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

