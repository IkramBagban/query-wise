import { AccessMessage } from "@/components/access-message";

/**
 * Shown when ADMIN_CLERK_USER_IDS is unset or empty (fail closed).
 * Middleware rewrites every route here; no nav shell.
 */
export default function NotConfiguredPage() {
  return (
    <AccessMessage
      code="ADMIN_NOT_CONFIGURED"
      title="Admin panel not configured"
      detail="Set ADMIN_CLERK_USER_IDS to a comma-separated list of Clerk user ids. Until then, every request is rejected in every environment."
    />
  );
}
