# SPEC V2-H: Persistent Conversations, Messages, And Query Runs

## Mission

Replace session-only chat with durable conversations that users can reopen and continue at any time.

## Dependencies

- Requires V2-F persistence contracts.
- Requires V2-A conversation authorization.
- Requires V2-C connection resolution/adapter contract.
- Coordinates UI DTOs with V2-U.

## Owned Areas

Suggested ownership:

```text
lib/conversations/**
lib/query-runs/**
app/api/conversations/**
app/api/query/** persistence integration
conversation/query-run tests
```

Do not own the visual chat sidebar or workspace shell.

## Required Deliverables

### 1. Conversation Lifecycle

Users can:

- create a conversation for a selected connection
- list conversations ordered by recent activity
- rename a conversation
- reopen and continue a conversation
- archive or delete a conversation

Changing a conversation's connection after messages exist is out of scope. Create a new conversation instead.

### 2. Message Persistence

Persist user and assistant messages with stable ordering and timestamps.

Messages may contain:

- natural-language content
- generated SQL reference
- chart configuration
- error/status metadata
- query-run reference

Do not store unrestricted result sets directly in message rows.

### 3. Query Runs

Persist execution metadata:

- generated SQL
- connection ID
- execution status
- row count
- execution duration
- bounded result preview
- error category/message suitable for the owner
- chart configuration
- created timestamp

Never persist decrypted credentials or LLM API keys.

### 4. Query API Integration

V2 query requests use `conversationId`.

The server:

1. authorizes the conversation
2. resolves its connection
3. stores the user message
4. executes the existing constrained-agent flow
5. stores query run and assistant message
6. updates conversation activity/title

The flow must be resilient to failures. A failed run should still leave useful conversation history without creating inconsistent partial records.

### 5. Conversation Titles

Generate a concise title from the first user message or use a deterministic truncated fallback. Title generation must not block the query response.

### 6. Pagination

- Cursor-paginate conversation lists.
- Cursor-paginate messages.
- Return compact list DTOs.
- Load full message/query-run details only for the open conversation.

## API Contract

Suggested endpoints:

```text
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/[conversationId]
PATCH  /api/conversations/[conversationId]
DELETE /api/conversations/[conversationId]
GET    /api/conversations/[conversationId]/messages
POST   /api/query
```

## Acceptance Criteria

- Conversations survive refresh, sign-out/sign-in, and browser changes.
- Opening history restores messages, SQL, result previews, and chart configuration.
- Follow-up questions use persisted prior context.
- Users cannot access another user's conversations.
- Query requests cannot substitute another connection ID.
- Query failures are persisted consistently.
- List endpoints remain compact and paginated.
- `npm run build` passes.

## Tests

- conversation CRUD ownership
- persisted follow-up context
- successful query transaction
- failed query persistence behavior
- pagination ordering
- result-preview size limit
- no credential/API-key persistence
