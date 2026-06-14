"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, ChevronDown, ChevronRight, Database, Home, LoaderCircle, Menu, MessageSquarePlus, PanelRight, Plus, Settings, Sparkles, X } from "lucide-react";

import { UserControl } from "@/components/v2/auth/UserControl";
import { useApiResource } from "@/hooks/v2";
import { conversationsApi, dashboardsApi, type ConversationListItem } from "@/lib/v2/api-client";

const mainLinks = [
  { href: "/chats/new", label: "Home", icon: Home },
  { href: "/connections", label: "Connections", icon: Database },
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

function SidebarTextLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link href={href} onClick={onClick} className={`block truncate rounded-lg px-3 py-1.5 text-xs transition ${active ? "bg-accent text-text-1" : "text-text-2 hover:bg-surface-3"}`}>
      {label}
    </Link>
  );
}

const CHAT_PAGE_SIZE = 20;

function SidebarChatHistory({ onNavigate }: { onNavigate?: () => void }) {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const page = await conversationsApi.list(CHAT_PAGE_SIZE, cursor);
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !known.has(item.id))];
      });
      setCursor(page.pageInfo.nextCursor ?? undefined);
      setHasMore(page.pageInfo.hasMore);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load chats");
    } finally {
      setLoading(false);
    }
  }, [cursor, hasMore, loading]);

  useEffect(() => {
    void loadMore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "120px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <section>
      <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">Chats</p>
      <div className="space-y-0.5">
        {items.map((item) => <SidebarTextLink key={item.id} href={`/chats/${item.id}`} label={item.title} onClick={onNavigate} />)}
        {!loading && !items.length && !error ? <p className="px-3 py-2 text-xs text-text-3">No conversations yet</p> : null}
        {error ? <button type="button" onClick={() => void loadMore()} className="w-full rounded-lg px-3 py-2 text-left text-xs text-danger hover:bg-surface-3">Retry loading chats</button> : null}
        <div ref={loadMoreRef} className="flex min-h-8 items-center justify-center">
          {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-text-3" /> : null}
        </div>
      </div>
    </section>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [dashboardsOpen, setDashboardsOpen] = useState(pathname.startsWith("/dashboards"));
  const dashboards = useApiResource(() => dashboardsApi.list(100), []);
  return (
    <aside className="flex h-full flex-col bg-surface p-3">
      <Link href="/chats/new" onClick={onNavigate} className="flex items-center gap-2 px-2 py-3 font-syne text-lg font-semibold">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent"><Sparkles className="h-4 w-4" /></span>
        QueryWise
      </Link>
      <Link href="/chats/new" onClick={onNavigate} className="my-3 flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold shadow-sm">
        <MessageSquarePlus className="h-4 w-4" /> New chat
      </Link>
      <nav className="space-y-1">{mainLinks.map((link) => <NavLink key={link.href} {...link} onClick={onNavigate} />)}</nav>
      <div className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto">
        <section>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={dashboardsOpen}
              aria-controls="sidebar-dashboard-list"
              onClick={() => setDashboardsOpen((open) => !open)}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-surface-3 ${pathname.startsWith("/dashboards") ? "text-text-1" : "text-text-2"}`}
            >
              {dashboardsOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="truncate">Dashboards</span>
              {dashboards.data ? <span className="ml-auto text-[10px] text-text-3">{dashboards.data.items.length}</span> : null}
            </button>
            <Link
              href="/dashboards"
              onClick={onNavigate}
              aria-label="Create or manage dashboards"
              title="Create or manage dashboards"
              className="rounded-lg p-2 text-text-3 transition hover:bg-surface-3 hover:text-text-1"
            >
              <Plus className="h-4 w-4" />
            </Link>
          </div>
          {dashboardsOpen ? (
            <div id="sidebar-dashboard-list" className="ml-4 mt-1 border-l border-border pl-2">
              {dashboards.data?.items.map((item) => <SidebarTextLink key={item.id} href={`/dashboards/${item.id}`} label={item.name} onClick={onNavigate} />)}
              {dashboards.loading ? <p className="px-3 py-2 text-xs text-text-3">Loading dashboards...</p> : null}
              {!dashboards.loading && !dashboards.data?.items.length ? <Link href="/dashboards" onClick={onNavigate} className="block rounded-lg px-3 py-2 text-xs text-text-3 hover:bg-surface-3 hover:text-text-1">Create your first dashboard</Link> : null}
            </div>
          ) : null}
        </section>
        <SidebarChatHistory onNavigate={onNavigate} />
      </div>
      <div className="mt-3 border-t border-border px-2 pt-3"><UserControl /></div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const conversationOpen = /^\/chats\/(?!new(?:\/|$))[^/]+/.test(pathname);
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="hidden border-r border-border lg:block"><div className="sticky top-0 h-screen"><Sidebar /></div></div>
      <div className="min-w-0">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-3 backdrop-blur lg:hidden">
          <button aria-label="Open navigation" onClick={() => setNavOpen(true)} className="rounded-lg border border-border p-2"><Menu className="h-4 w-4" /></button>
          <span className="font-syne font-semibold">QueryWise</span>
          {conversationOpen ? <button aria-label="Open context" onClick={() => setContextOpen(true)} className="rounded-lg border border-border p-2"><PanelRight className="h-4 w-4" /></button> : <span className="h-9 w-9" />}
        </div>
        <main className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen">{children}</main>
      </div>
      {navOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} aria-label="Close navigation" /><div className="relative h-full w-[86vw] max-w-[300px]"><Sidebar onNavigate={() => setNavOpen(false)} /><button aria-label="Close navigation" className="absolute right-2 top-2 p-2" onClick={() => setNavOpen(false)}><X className="h-4 w-4" /></button></div></div> : null}
      {conversationOpen && contextOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/40" onClick={() => setContextOpen(false)} aria-label="Close context" /><aside className="absolute right-0 h-full w-[86vw] max-w-[360px] bg-surface p-5"><button aria-label="Close context" className="absolute right-2 top-2 p-2" onClick={() => setContextOpen(false)}><X className="h-4 w-4" /></button><h2 className="font-syne text-lg font-semibold">Context panel</h2><p className="mt-2 text-sm text-text-3">Inspect the active connection, schema, and SQL preview from the conversation workspace.</p></aside></div> : null}
    </div>
  );
}
