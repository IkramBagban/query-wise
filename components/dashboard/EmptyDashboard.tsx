import Link from "next/link";

import { Card } from "@/components/ui/card";

export function EmptyDashboard() {
  return (
    <Card className="mx-auto mt-14 max-w-xl rounded-3xl border border-[#174128]/18 bg-white/95 p-8 text-center shadow-[0_16px_40px_rgba(14,41,24,0.12)]">
      <div className="mx-auto mb-4 h-20 w-20 rounded-full border border-[#174128]/15 bg-[radial-gradient(circle_at_30%_30%,#f0ffe8_0%,#def6d4_90%)]" />
      <h2 className="font-syne text-2xl text-text-1">No widgets yet</h2>
      <p className="mt-2 text-sm text-[#355442]">Go to workspace, ask a question, then save the result as a widget.</p>
      <Link
        href="/workspace"
        className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-[#2ed52e] px-4 text-sm font-semibold text-white transition-all duration-150 hover:brightness-105"
      >
        Go to Workspace
      </Link>
    </Card>
  );
}
