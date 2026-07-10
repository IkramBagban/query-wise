/**
 * Alias DATABASE_URL → QUERYWISE_APP_DATABASE_URL so the admin app can use the
 * SPEC-08 env name while packages/shared reads the monorepo name.
 */
export async function register() {
  if (
    process.env.DATABASE_URL &&
    !process.env.QUERYWISE_APP_DATABASE_URL
  ) {
    process.env.QUERYWISE_APP_DATABASE_URL = process.env.DATABASE_URL;
  }
}
