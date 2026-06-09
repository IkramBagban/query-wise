# SPEC V2-A: Clerk Authentication And User-Level Authorization

## Mission

Replace disabled demo authentication with Clerk and enforce user-level ownership across private V2 resources.

## Dependencies

- Requires V2-F auth/DAL contracts.
- Coordinate with every API-owning agent on authorization helper usage.

## Owned Areas

Suggested ownership:

```text
proxy.ts or the Next.js 16 Clerk routing file
app/sign-in/**
app/sign-up/**
lib/auth/**
lib/dal/authorization/**
auth-specific layout/provider integration
auth tests
```

Do not implement feature repositories or feature UI beyond authentication surfaces and user controls.

## Required Deliverables

### 1. Clerk Integration

- Add Clerk provider at the correct App Router boundary.
- Add sign-in/sign-up routes or Clerk-hosted equivalents.
- Add Clerk user/profile controls in a reusable component.
- Protect private application routes.
- Keep public share routes accessible without signing in.

Read current Clerk and Next.js 16 documentation before implementation.

### 2. Server Authorization Helpers

Implement:

```ts
requireUser()
requireOwnedConnection(connectionId)
requireConversationAccess(conversationId)
requireDashboardAccess(dashboardId, permission)
```

Rules:

- never trust client-provided user identity
- private resource access is owner-scoped
- dashboard edit access is owner-only in V2
- dashboard view access may also come from a valid access grant
- public share access uses the sharing module, not private dashboard helpers

### 3. Route Protection Strategy

Use defense in depth:

- route-level protection for private pages
- authorization checks in DAL/helpers for every private resource operation

Do not rely only on middleware/proxy checks.

### 4. Local User Profile

Create or synchronize a lightweight application user record keyed by Clerk user ID when needed. Store only product-required profile data.

### 5. Migration From V1 Auth

- Remove use of the fixed demo session for private V2 routes.
- Do not silently leave any V2 endpoint with commented-out auth.
- Coordinate deletion/replacement of legacy auth files; do not remove another agent's work without approval.

## Acceptance Criteria

- Unauthenticated users cannot access private pages or APIs.
- Authenticated users can access their own resources.
- A user cannot read, edit, or delete another user's connection, conversation, or dashboard by changing an ID.
- Public share pages remain accessible through valid share credentials.
- Route handlers call shared authorization helpers rather than duplicating logic.
- Auth errors do not disclose whether another user's private resource exists.
- `npm run build` passes.

## Tests

- unauthenticated private API request
- owner access success
- cross-user access failure for each resource type
- public share access remains public
- dashboard access grant view behavior

