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
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <UserProfile 
            path="/profile" 
            routing="path" 
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none bg-transparent w-full rounded-none border-0",
                navbar: "border-r border-border hidden sm:block",
                navbarMobileMenuButton: "text-foreground",
                navbarButton: "text-muted-foreground hover:bg-muted hover:text-foreground",
                headerTitle: "font-syne text-foreground",
                headerSubtitle: "text-muted-foreground",
                profileSectionTitleText: "text-foreground font-syne",
                profileSectionPrimaryButton: "text-primary hover:bg-muted",
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
