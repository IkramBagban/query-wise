"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Database, History, Home, Menu, MessageSquarePlus, PanelRight, Settings, Sparkles, X } from "lucide-react";

import { UserControl } from "@/components/v2/auth/UserControl";
import { useApiResource } from "@/hooks/v2";
import { conversationsApi, dashboardsApi } from "@/lib/v2/api-client";

const mainLinks = [
  { href: "/chats", label: "Home", icon: Home },
  { href: "/connections", label: "Connections", icon: Database },
  { href: "/dashboards", label: "Dashboards", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLink({ href, label, icon: Icon, compact = false, onClick }: {
  href: string; label: string; icon: typeof Home; compact?: boolean; onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/chats" && pathname.startsWith(`${href}/`));
  return (
    <Link href={href} onClick={onClick} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-accent text-text-1" : "text-text-2 hover:bg-surface-3"} ${compact ? "py-1.5 text-xs" : ""}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const dashboards = useApiResource(() => dashboardsApi.list(4), []);
  const conversations = useApiResource(() => conversationsApi.list(5), []);
  return (
    <aside className="flex h-full flex-col bg-surface p-3">
      <Link href="/chats" onClick={onNavigate} className="flex items-center gap-2 px-2 py-3 font-syne text-lg font-semibold">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent"><Sparkles className="h-4 w-4" /></span>
        QueryWise
      </Link>
      <Link href="/chats/new" onClick={onNavigate} className="my-3 flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold shadow-sm">
        <MessageSquarePlus className="h-4 w-4" /> New chat
      </Link>
      <nav className="space-y-1">{mainLinks.map((link) => <NavLink key={link.href} {...link} onClick={onNavigate} />)}</nav>
      <div className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto">
        <section>
          <div className="mb-1 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">
            Recent dashboards <Link href="/dashboards" onClick={onNavigate}>See all</Link>
          </div>
          {dashboards.data?.items.map((item) => <NavLink key={item.id} href={`/dashboards/${item.id}`} label={item.name} icon={BarChart3} compact onClick={onNavigate} />)}
          {!dashboards.loading && !dashboards.data?.items.length ? <p className="px-3 py-2 text-xs text-text-3">No dashboards yet</p> : null}
        </section>
        <section>
          <div className="mb-1 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">
            Recent history <Link href="/chats" onClick={onNavigate}>See all</Link>
          </div>
          {conversations.data?.items.map((item) => <NavLink key={item.id} href={`/chats/${item.id}`} label={item.title} icon={History} compact onClick={onNavigate} />)}
          {!conversations.loading && !conversations.data?.items.length ? <p className="px-3 py-2 text-xs text-text-3">No conversations yet</p> : null}
        </section>
      </div>
      <div className="mt-3 border-t border-border px-2 pt-3"><UserControl /></div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="hidden border-r border-border lg:block"><div className="sticky top-0 h-screen"><Sidebar /></div></div>
      <div className="min-w-0">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-3 backdrop-blur lg:hidden">
          <button aria-label="Open navigation" onClick={() => setNavOpen(true)} className="rounded-lg border border-border p-2"><Menu className="h-4 w-4" /></button>
          <span className="font-syne font-semibold">QueryWise</span>
          <button aria-label="Open context" onClick={() => setContextOpen(true)} className="rounded-lg border border-border p-2"><PanelRight className="h-4 w-4" /></button>
        </div>
        <main className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen">{children}</main>
      </div>
      {navOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} aria-label="Close navigation" /><div className="relative h-full w-[86vw] max-w-[300px]"><Sidebar onNavigate={() => setNavOpen(false)} /><button aria-label="Close navigation" className="absolute right-2 top-2 p-2" onClick={() => setNavOpen(false)}><X className="h-4 w-4" /></button></div></div> : null}
      {contextOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/40" onClick={() => setContextOpen(false)} aria-label="Close context" /><aside className="absolute right-0 h-full w-[86vw] max-w-[360px] bg-surface p-5"><button aria-label="Close context" className="absolute right-2 top-2 p-2" onClick={() => setContextOpen(false)}><X className="h-4 w-4" /></button><h2 className="font-syne text-lg font-semibold">Context panel</h2><p className="mt-2 text-sm text-text-3">Open a conversation to inspect its active connection, schema, and SQL preview.</p></aside></div> : null}
    </div>
  );
}
