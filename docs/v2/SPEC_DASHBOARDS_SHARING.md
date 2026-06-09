# SPEC V2-D: Multiple Dashboards And Sharing

## Mission

Replace the single session dashboard with durable multiple dashboards and controlled sharing.

## Dependencies

- Requires V2-F persistence contracts.
- Requires V2-A dashboard authorization.
- Uses query-run references from V2-H when available.
- Coordinates UI DTOs with V2-U.

## Owned Areas

Suggested ownership:

```text
lib/dashboards/**
lib/sharing/**
app/api/dashboards/**
app/api/public/shares/**
dashboard/share tests
```

Do not own the workspace shell or dashboard visual design.

## Required Deliverables

### 1. Multiple Dashboards

Users can:

- create dashboards
- list dashboards
- open a dashboard
- rename dashboards
- delete dashboards
- add/remove/reorder/resize widgets

All dashboard mutations are owner-only.

### 2. Widget Model

A widget stores:

- title
- chart configuration
- display/layout configuration
- bounded snapshot/result preview
- optional query-run reference
- optional saved SQL/query definition for future refresh support

V2 default behavior is **snapshot widgets**. Automatic live refresh is out of scope unless separately approved.

### 3. Sharing Modes

Support:

- public unlisted link
- password-protected unlisted link
- direct email/user access

Direct email sharing creates an access grant. If the email belongs to a Clerk user, associate the user ID when possible. Pending-email invitation delivery can use an email provider, but the access model must not depend solely on sending an email.

### 4. Share Security

- Generate high-entropy share tokens.
- Store share tokens hashed where practical.
- Store share passwords only as strong password hashes.
- Rate-limit password attempts.
- Support revoke/disable.
- Optional expiry should be supported by the data model.
- Public share responses return only dashboard-safe DTOs.

### 5. Permissions

V2 permissions:

- owner: view/edit/share/delete
- direct recipient: view
- public link viewer: view

Shared editing is out of scope.

### 6. Data Exposure

Shared dashboards must never expose:

- connection credentials
- private connection details beyond a safe display name if required
- conversation history
- private schema metadata
- owner-only controls

## API Contract

Suggested endpoints:

```text
GET    /api/dashboards
POST   /api/dashboards
GET    /api/dashboards/[dashboardId]
PATCH  /api/dashboards/[dashboardId]
DELETE /api/dashboards/[dashboardId]
POST   /api/dashboards/[dashboardId]/widgets
PATCH  /api/dashboards/[dashboardId]/widgets/[widgetId]
DELETE /api/dashboards/[dashboardId]/widgets/[widgetId]
GET    /api/dashboards/[dashboardId]/shares
POST   /api/dashboards/[dashboardId]/shares
DELETE /api/dashboards/[dashboardId]/shares/[shareId]
GET    /api/public/shares/[token]
POST   /api/public/shares/[token]/unlock
```

## Acceptance Criteria

- Users can manage multiple durable dashboards.
- Saving a chat result lets the user choose a dashboard or create one.
- Cross-user dashboard edits are blocked.
- Direct recipients can view only explicitly shared dashboards.
- Public/password links can be revoked.
- Incorrect share passwords are rate-limited.
- Shared DTOs contain no credentials, private schema, or conversation data.
- Dashboards remain available across deployments and server instances.
- `npm run build` passes.

## Tests

- dashboard CRUD ownership
- widget layout persistence
- direct access grant behavior
- public link access and revocation
- password hash/unlock/rate limit
- expired link behavior
- shared DTO secret-leak test

