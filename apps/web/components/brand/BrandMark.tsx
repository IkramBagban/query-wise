import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-8 shrink-0 overflow-hidden rounded-lg bg-accent", className)}
    >
      <Image
        src="/querywise-logo.png"
        alt=""
        width={512}
        height={512}
        sizes="64px"
        className="size-full object-cover"
      />
    </span>
  );
}
