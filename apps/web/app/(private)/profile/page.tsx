import { UserProfile } from "@clerk/nextjs";

import { PageHeader } from "@/components/PageHeader";

export default function Page() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          eyebrow="Account"
          title="Profile"
          description="Update your personal details, security settings, and sign-in methods."
        />
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <UserProfile path="/profile" routing="path" />
        </div>
      </div>
    </div>
  );
}
