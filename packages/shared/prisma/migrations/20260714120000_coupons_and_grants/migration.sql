-- SPEC-12: Coupons & time-boxed grants. Fully additive — two new tables, no
-- changes to any existing table, enum, or column. Historical plan/usage behavior
-- is untouched. Grants are folded into the entitlement resolver at read time and
-- auto-expire (no cron, no plan mutation).

-- Coupon (the admin-authored template).
CREATE TABLE "v2_coupons" (
  "id"                        uuid NOT NULL,
  "code"                      text NOT NULL,
  "label"                     text,
  "created_by_admin"          text NOT NULL,
  "questions_per_day_delta"   integer NOT NULL DEFAULT 0,
  "questions_per_month_delta" integer NOT NULL DEFAULT 0,
  "max_connections_delta"     integer NOT NULL DEFAULT 0,
  "max_dashboards_delta"      integer NOT NULL DEFAULT 0,
  "grants_pro"                boolean NOT NULL DEFAULT false,
  "grant_duration_days"       integer NOT NULL,
  "redeemable_until"          timestamptz(6),
  "max_redemptions"           integer,
  "redemption_count"          integer NOT NULL DEFAULT 0,
  "disabled_at"               timestamptz(6),
  "created_at"                timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"                timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "v2_coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "v2_coupons_code_key" ON "v2_coupons" ("code");
CREATE INDEX "v2_coupons_active_idx" ON "v2_coupons" ("disabled_at", "redeemable_until");

-- CouponRedemption (the grant ledger; one row per user per coupon).
CREATE TABLE "v2_coupon_redemptions" (
  "id"                        uuid NOT NULL,
  "coupon_id"                 uuid NOT NULL,
  "user_id"                   text NOT NULL,
  "redeemed_at"               timestamptz(6) NOT NULL DEFAULT now(),
  "grant_expires_at"          timestamptz(6) NOT NULL,
  "questions_per_day_delta"   integer NOT NULL DEFAULT 0,
  "questions_per_month_delta" integer NOT NULL DEFAULT 0,
  "max_connections_delta"     integer NOT NULL DEFAULT 0,
  "max_dashboards_delta"      integer NOT NULL DEFAULT 0,
  "grants_pro"                boolean NOT NULL DEFAULT false,
  CONSTRAINT "v2_coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- One redemption per user per coupon, ever (double-redeem guard).
CREATE UNIQUE INDEX "v2_coupon_redemptions_coupon_user_key"
  ON "v2_coupon_redemptions" ("coupon_id", "user_id");
-- Resolver hot path: active grants for a user.
CREATE INDEX "v2_coupon_redemptions_user_active_idx"
  ON "v2_coupon_redemptions" ("user_id", "grant_expires_at");

ALTER TABLE "v2_coupon_redemptions"
  ADD CONSTRAINT "v2_coupon_redemptions_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "v2_coupons" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
