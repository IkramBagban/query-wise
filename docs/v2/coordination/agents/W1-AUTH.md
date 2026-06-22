# Work Log: W1-AUTH

## Scope And Ownership

- Mission: Clerk user authentication and owner-scoped V2 authorization.
- Owned files/modules: `lib/v2/auth/**`, `lib/v2/dal/authorization/**`,
  `app/(auth)/**`, `components/v2/auth/**`, `proxy.ts`, and this log.
- Explicitly out of scope: feature repositories/APIs, public-share access
  implementation, shared types, package manifests, `.env*`, and root layout.
- Dependencies: C1 Prisma app DB/DAL foundation, Clerk v7, and Next.js 16
  Proxy.

## Design And Security

- `proxy.ts` initializes Clerk for APIs but performs redirect protection only
  for private pages. Auth routes, root, and public-share pages remain public.
- `requireUser()` resolves server identity and throws typed
  `AUTHENTICATION_REQUIRED`; API owners retain control of V2 401 responses.
- Resource helpers scope private reads by authenticated Clerk user ID and
  collapse absent/cross-user records to `RESOURCE_NOT_FOUND`.
- Resource helpers use the finalized Prisma client and C1 owner-scope
  predicates; no Drizzle dependency remains in W1-AUTH.
- Dashboard view permits an explicit user grant; dashboard edit is owner-only.
  Grant-based view access uses one parameterized Prisma query so concurrent
  revocation cannot leave a stale two-query authorization window. Public share
  access remains a separate sharing-module concern.
- The current schema directly stores Clerk IDs on owned resources, so a local
  user profile write is not required for authorization.

## Progress

- [x] Exploration complete
- [x] Design recorded
- [x] Implementation complete
- [ ] Build complete
- [ ] Atomic commit(s) created

## Verification

- `git diff --check` passed for all W1-AUTH-owned paths.
- TypeScript and build intentionally paused during concurrent Prisma client
  generation. `prisma/schema.prisma` and `lib/v2/app-db/client.ts` exist; the
  generated `node_modules/.prisma/client` path was not present at last check.

## Integration Notes

- `app/layout.tsx` must be wrapped with Clerk's `ClerkProvider`; W2-UI owns that
  serialized file. Configure local URLs `/sign-in` and `/sign-up`.
- Private API/service owners should call the exported helpers and map
  `AppError("AUTHENTICATION_REQUIRED")` to typed 401 responses.
- No commit requested or created.
