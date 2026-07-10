import { AdminShell } from "@/components/admin-shell";
import { AccessMessage } from "@/components/access-message";
import {
  AdminAccessError,
  requireAdmin,
} from "@/lib/admin-auth";

/**
 * Defense in depth: every admin page re-checks requireAdmin even after middleware.
 * On denial, render the static terminal without the nav shell.
 */
export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const { adminClerkUserId } = await requireAdmin();
    return (
      <AdminShell adminClerkUserId={adminClerkUserId}>{children}</AdminShell>
    );
  } catch (error) {
    if (error instanceof AdminAccessError) {
      if (error.code === "ADMIN_NOT_CONFIGURED") {
        return (
          <AccessMessage
            code="ADMIN_NOT_CONFIGURED"
            title="Admin panel not configured"
            detail="Set ADMIN_CLERK_USER_IDS to a comma-separated list of Clerk user ids. Until then, every request is rejected in every environment."
          />
        );
      }
      return (
        <AccessMessage
          code="ADMIN_FORBIDDEN"
          title="Access denied"
          detail="You are signed in but not authorized to use this admin panel."
        />
      );
    }
    throw error;
  }
}
