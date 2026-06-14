"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, ChevronRight, Database, Home, LoaderCircle, Menu, MessageSquare, MessageSquarePlus, PanelRight, Plus, Search, Settings, Sparkles, X } from "lucide-react";

import { ChatSearchDialog } from "@/components/v2/ChatSearchDialog";
import { UserControl } from "@/components/v2/auth/UserControl";
import { useApiResource } from "@/hooks/v2";
import { formatRelativeTime } from "@/lib/utils";
import { conversationsApi, dashboardsApi, type ConversationListItem } from "@/lib/v2/api-client";

function NavLink({ href, label, icon: Icon, onClick }: {
  href: string; label: string; icon: typeof Home; onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/chats" && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-accent-dim text-accent-2" : "text-text-2 hover:bg-surface-3 hover:text-text-1"}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-accent-2" : "text-text-3 group-hover:text-text-1"}`} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function NavButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Home; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-text-2 transition hover:bg-surface-3 hover:text-text-1"
    >
      <Icon className="h-4 w-4 shrink-0 text-text-3 group-hover:text-text-1" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SidebarChatLink({ href, label, meta, onClick }: { href: string; label: string; meta?: string; onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition ${active ? "bg-accent-dim text-accent-2" : "text-text-2 hover:bg-surface-3 hover:text-text-1"}`}
    >
      <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${active ? "text-accent-2" : "text-text-3 group-hover:text-text-2"}`} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? <span className="shrink-0 text-[10px] text-text-3">{meta}</span> : null}
    </Link>
  );
}

const CHAT_PAGE_SIZE = 20;
const DASHBOARD_PREVIEW_COUNT = 3;

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
      <div className="mb-1.5 flex items-center justify-between px-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">Chats</p>
        <Link
          href="/chats/new"
          onClick={onNavigate}
          aria-label="New chat"
          title="New chat"
          className="rounded-md p-1 text-text-3 transition hover:bg-surface-3 hover:text-text-1"
        >
          <Plus className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <SidebarChatLink
            key={item.id}
            href={`/chats/${item.id}`}
            label={item.title}
            meta={formatRelativeTime(item.lastActivityAt, "")}
            onClick={onNavigate}
          />
        ))}
        {!loading && !items.length && !error ? <p className="px-3 py-2 text-xs text-text-3">No conversations yet</p> : null}
        {error ? <button type="button" onClick={() => void loadMore()} className="w-full rounded-lg px-3 py-2 text-left text-xs text-danger hover:bg-surface-3">Retry loading chats</button> : null}
        <div ref={loadMoreRef} className="flex min-h-8 items-center justify-center">
          {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-text-3" /> : null}
        </div>
      </div>
    </section>
  );
}

function Sidebar({ onNavigate, onOpenSearch }: { onNavigate?: () => void; onOpenSearch: () => void }) {
  const pathname = usePathname();
  const dashboards = useApiResource(() => dashboardsApi.list(100), []);
  const allDashboards = dashboards.data?.items ?? [];
  const visibleDashboards = allDashboards.slice(0, DASHBOARD_PREVIEW_COUNT);
  const hasMoreDashboards = allDashboards.length > DASHBOARD_PREVIEW_COUNT;

  const openSearch = () => {
    onNavigate?.();
    onOpenSearch();
  };

  return (
    <aside className="flex h-full flex-col bg-bg p-3">
      <Link href="/chats/new" onClick={onNavigate} className="flex items-center gap-2.5 px-2 py-3 font-syne text-lg font-semibold tracking-tight">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-text-1 shadow-sm"><Sparkles className="h-4 w-4" /></span>
        QueryWise
      </Link>
      <Link
        href="/chats/new"
        onClick={onNavigate}
        className="my-3 flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-text-1 shadow-sm transition hover:brightness-110"
      >
        <MessageSquarePlus className="h-4 w-4" /> New chat
        <kbd className="ml-auto rounded border border-text-1/20 bg-text-1/10 px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </Link>

      <div className="border-b border-border pb-4">
        <p className="mb-1 mt-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">Main</p>
        <nav className="space-y-1">
          <NavLink href="/chats/new" label="Home" icon={Home} onClick={onNavigate} />
          <NavButton label="Search chats" icon={Search} onClick={openSearch} />
          <NavLink href="/connections" label="Connections" icon={Database} onClick={onNavigate} />
          <NavLink href="/settings" label="Settings" icon={Settings} onClick={onNavigate} />
        </nav>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
        <section className="border-b border-border pb-4">
          <div className="mb-1.5 flex items-center justify-between px-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">Dashboards</p>
            <Link
              href="/dashboards"
              onClick={onNavigate}
              aria-label="Create or manage dashboards"
              title="Create or manage dashboards"
              className="rounded-md p-1 text-text-3 transition hover:bg-surface-3 hover:text-text-1"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-0.5">
            {visibleDashboards.map((item) => (
              <Link
                key={item.id}
                href={`/dashboards/${item.id}`}
                onClick={onNavigate}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs transition ${pathname === `/dashboards/${item.id}` ? "bg-accent-dim text-accent-2" : "text-text-2 hover:bg-surface-3 hover:text-text-1"}`}
              >
                <BarChart3 className={`h-3.5 w-3.5 shrink-0 ${pathname === `/dashboards/${item.id}` ? "text-accent-2" : "text-text-3 group-hover:text-text-2"}`} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.widgetCount ? <span className="shrink-0 text-[10px] text-text-3">{item.widgetCount}</span> : null}
              </Link>
            ))}
            {dashboards.loading && !allDashboards.length ? <p className="px-3 py-2 text-xs text-text-3">Loading dashboards...</p> : null}
            {!dashboards.loading && !allDashboards.length ? <Link href="/dashboards" onClick={onNavigate} className="block rounded-lg px-3 py-2 text-xs text-text-3 hover:bg-surface-3 hover:text-text-1">Create your first dashboard</Link> : null}
            {hasMoreDashboards ? (
              <Link href="/dashboards" onClick={onNavigate} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-text-3 transition hover:text-text-1">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </section>
        <SidebarChatHistory onNavigate={onNavigate} />
      </div>
      <div className="mt-3 rounded-xl border border-border bg-surface p-2 shadow-sm"><UserControl /></div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const conversationOpen = /^\/chats\/(?!new(?:\/|$))[^/]+/.test(pathname);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="hidden border-r border-border lg:block"><div className="sticky top-0 h-screen"><Sidebar onOpenSearch={() => setSearchOpen(true)} /></div></div>
      <div className="min-w-0">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-3 backdrop-blur lg:hidden">
          <button aria-label="Open navigation" onClick={() => setNavOpen(true)} className="rounded-lg border border-border p-2"><Menu className="h-4 w-4" /></button>
          <span className="font-syne font-semibold">QueryWise</span>
          {conversationOpen ? <button aria-label="Open context" onClick={() => setContextOpen(true)} className="rounded-lg border border-border p-2"><PanelRight className="h-4 w-4" /></button> : <span className="h-9 w-9" />}
        </div>
        <main className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen">{children}</main>
      </div>
      <ChatSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      {navOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} aria-label="Close navigation" /><div className="relative h-full w-[86vw] max-w-[300px]"><Sidebar onNavigate={() => setNavOpen(false)} onOpenSearch={() => setSearchOpen(true)} /><button aria-label="Close navigation" className="absolute right-2 top-2 p-2" onClick={() => setNavOpen(false)}><X className="h-4 w-4" /></button></div></div> : null}
      {conversationOpen && contextOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/40" onClick={() => setContextOpen(false)} aria-label="Close context" /><aside className="absolute right-0 h-full w-[86vw] max-w-[360px] bg-surface p-5"><button aria-label="Close context" className="absolute right-2 top-2 p-2" onClick={() => setContextOpen(false)}><X className="h-4 w-4" /></button><h2 className="font-syne text-lg font-semibold">Context panel</h2><p className="mt-2 text-sm text-text-3">Inspect the active connection, schema, and SQL preview from the conversation workspace.</p></aside></div> : null}
    </div>
  );
}
