const config = {
  dialect: "postgresql",
  schema: "./lib/v2/app-db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.QUERYWISE_APP_DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
};

export default config;
