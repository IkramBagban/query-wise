"use client";

import { useState, useTransition } from "react";
import { setCouponDisabledAction } from "@/lib/actions/coupon-actions";

export function CouponDisableButton({
  couponId,
  disabled,
}: {
  couponId: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result: { ok: boolean; error?: string } = await setCouponDisabledAction({
        couponId,
        disabled: !disabled,
      });
      if (!result.ok) setError(result.error ?? "Coupon update failed.");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        className={
          disabled
            ? "rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            : "rounded bg-danger/90 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        }
        onClick={toggle}
      >
        {pending ? "Saving…" : disabled ? "Enable coupon" : "Disable coupon"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
