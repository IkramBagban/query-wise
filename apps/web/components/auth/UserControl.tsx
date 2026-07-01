"use client";

import { UserButton } from "@clerk/nextjs";

export function UserControl({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <UserButton
      showName={!iconOnly}
      appearance={{
        elements: {
          userButtonBox: "text-text-1",
          userButtonOuterIdentifier: "text-sm font-medium text-text-1",
        },
      }}
    />
  );
}
