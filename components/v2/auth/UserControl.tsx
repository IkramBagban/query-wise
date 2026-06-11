"use client";

import { UserButton } from "@clerk/nextjs";

export function UserControl() {
  return (
    <UserButton
      showName
      appearance={{
        elements: {
          userButtonBox: "text-text-1",
          userButtonOuterIdentifier: "text-sm font-medium text-text-1",
        },
      }}
    />
  );
}
