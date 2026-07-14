import Link from "next/link";
import { Card } from "@/components/ui";
import { CouponCreateForm } from "@/components/coupon-create-form";

export default function NewCouponPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1 border-b border-border/50 pb-6">
        <Link href="/coupons" className="mb-2 text-xs text-muted-foreground hover:text-primary">
          ← Coupons
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New coupon</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Author a redeemable code. Values are clamped server-side and the action is audited.
        </p>
      </div>

      <Card>
        <CouponCreateForm />
      </Card>
    </div>
  );
}
