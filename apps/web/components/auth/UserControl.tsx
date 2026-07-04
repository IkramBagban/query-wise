"use client";

import { UserButton } from "@clerk/nextjs";

export function UserControl({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <UserButton
      showName={!iconOnly}
      appearance={{
        elements: {
          userButtonBox: "text-text",
          userButtonOuterIdentifier: "text-sm font-medium text-text",
        },
      }}
    />
  );
}
