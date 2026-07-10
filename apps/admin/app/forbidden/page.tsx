import { AccessMessage } from "@/components/access-message";

/**
 * Shown to signed-in users who are not on the allowlist.
 * Reveals nothing about panel contents; no nav shell.
 */
export default function ForbiddenPage() {
  return (
    <AccessMessage
      code="ADMIN_FORBIDDEN"
      title="Access denied"
      detail="You are signed in but not authorized to use this admin panel."
    />
  );
}
