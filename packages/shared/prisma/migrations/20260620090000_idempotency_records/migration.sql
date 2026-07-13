CREATE TABLE "v2_idempotency_records" (
    "id" UUID NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "operation" VARCHAR(100) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "response" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "v2_idempotency_owner_operation_key"
    ON "v2_idempotency_records"("owner_user_id", "operation", "idempotency_key");

CREATE INDEX "v2_idempotency_expiry_idx"
    ON "v2_idempotency_records"("expires_at");
