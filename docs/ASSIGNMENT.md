Build a Conversational BI Platform 
(Node.js/TypeScript) 
Overview 
Build a text-to-SQL platform that lets users connect their PostgreSQL database, ask natural 
language questions, and get answers with auto-generated visualizations. Include a 
pre-seeded demo database so users can try it instantly. 
Core Requirements 
● Pre-seeded Demo Database: Use Faker.js to generate realistic ecommerce data 
(customers, products, orders, order_items, categories, reviews) — 10K+ orders 
spanning 12 months. Host this as a read-only demo database users can query 
immediately. 
● Custom Database Connection: Allow users to connect their own PostgreSQL database 
by providing connection string (host, port, database, user, password). Support both 
the demo DB and user DBs. 
● One-Click Schema Analysis: On connect, automatically introspect the database 
schema. Extract tables, columns, data types, foreign key relationships, and sample 
values. Present a clear, readable schema summary to the user. 
● Natural Language Queries: Users type questions in plain English (e.g., "Show me top 
10 customers by total spend last quarter"). Generate SQL, execute it safely, and 
return results. Handle follow-up questions with context (e.g., "Now show only from 
California"). 
● Auto-Generated Visualizations: Detect the result type and render appropriate charts 
(bar, line, pie, scatter, tables). Users should be able to switch chart types manually. 
● Ad-Hoc Dashboards: Let users save query results as dashboard widgets. Build and 
arrange multiple widgets into a dashboard view. Dashboards should be shareable via 
link. 
● Query Safety: Implement safeguards — limit result rows, prevent destructive queries 
(DROP, DELETE, TRUNCATE), timeout long-running queries. 
● Basic Authentication: Fixed username/password for demo access. Store user API keys 
securely for LLM calls. 
LLM Requirements 
● Use a frontier model (GPT, Claude Opus/Sonnet, or Gemini) for schema analysis and 
SQL generation 
● User provides their own API key (stored in session or local storage- no backend key 
storage required) 
● Model must receive full schema context + sample data to generate accurate SQL 
● Implement retry and fallback for model errors 
Example Queries Your Platform Should Handle 
● "What were the top 5 products by revenue last month?" → bar chart with product 
names and revenue 
● "Show me order count by day for the past 30 days" → line chart with date on X-axis 
● "Which customers have placed more than 10 orders but never left a review?" → table 
with customer details 
● "Compare revenue by category this quarter vs last quarter" → grouped bar chart or 
comparison table 
● "What is the average order value by customer segment?" → pie chart or table with 
segments 
Constraints 
● No text-to-SQL platforms or SaaS wrappers (e.g., no Vanna AI, no Text-to-SQL 
managed services) 
● No BI frameworks that abstract the SQL generation (e.g., no Metabase embedding, no 
Superset) 
● You may use: PostgreSQL client libraries (pg, node-postgres), chart libraries (Chart.js, 
Recharts, ECharts), LLM provider SDKs (OpenAI, Anthropic, Google) 
● The SQL generation logic, schema analysis, and chart recommendation must be 
implemented from scratch using raw LLM calls 
● PostgreSQL only — no MySQL, SQLite, or other databases required 
Technical Stack (Suggested) 
● Backend: Node.js/Express or Next.js API routes 
● Frontend: React, Vue, or vanilla JS 
● Database: PostgreSQL (host demo on Supabase, Neon, Railway, or similar free tier) 
● Charts: Chart.js, Recharts, ECharts, or similar 
● LLM: OpenAI API, Anthropic API, or Google AI API 
Grading Criteria 
● UI/UX quality — is the interface intuitive? Does it feel polished? 
● Code structure, readability, and maintainability 
● Accuracy of SQL generation across diverse query types 
● Quality of schema analysis and presentation 
● Chart selection and rendering quality 
● Error handling and edge case coverage 
● Speed and responsiveness. 
Submission 
● GitHub repo with clear README and setup instructions 
● Video demo (2-3 min walkthrough demoing the work) 
● Deployed web app (can use Vercel) 
● Demo database must be accessible and pre-seeded 
Note 
You are free to use coding agents (Claude, GPT, Copilot, etc.) as assistants. The goal is to 
evaluate how quickly you can ship a working, production-quality system. There is no fixed 
deadline, but your time-to-completion will be benchmarked against other candidates. 
Do not use the name "Libra" for your application. 