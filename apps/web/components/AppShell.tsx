"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Home,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { BrandMark } from "@/components/brand/BrandMark";
import { ChatSearchDialog } from "@/components/ChatSearchDialog";
import { AccountMenu } from "@/components/auth/AccountMenu";

import { Tooltip } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { SidebarRowsSkeleton } from "@/components/LoadingSkeletons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useAppState } from "@/store/app-state/provider";
import { formatRelativeTime } from "@/lib/utils";
import { conversationsApi, dashboardsApi, type ConversationListItem, type DashboardListItem } from "@/lib/api-client";

function NavLink({ href, label, icon: Icon, onClick }: {
  href: string; label: string; icon: typeof Home; onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/chats" && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-2 hover:text-text"}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-accent-strong" : "text-faint group-hover:text-text"}`} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function NavButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Home; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-text"
    >
      <Icon className="h-4 w-4 shrink-0 text-faint group-hover:text-text" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SidebarChatLink({ href, label, meta, onClick, onRename, onDelete }: { href: string; label: string; meta?: string; onClick?: () => void; onRename?: (newName: string) => void; onDelete?: () => void; }) {
  const pathname = usePathname();
  const active = pathname === href;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`group relative flex items-center rounded-lg transition ${active ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-2 hover:text-text"}`}>
      <Link
        href={href}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-xs pr-8"
      >
        <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${active ? "text-accent-strong" : "text-faint group-hover:text-muted"}`} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {meta && !menuOpen ? <span className="absolute right-3 shrink-0 text-[10px] text-faint group-hover:hidden">{meta}</span> : null}
      </Link>
      
      {onRename && onDelete && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            className={`absolute right-2 h-5 w-5 items-center justify-center rounded hover:bg-surface-3 ${menuOpen ? "flex bg-surface-3" : "hidden group-hover:flex"}`}
            onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => {
              e.preventDefault();
              const newName = window.prompt("Rename conversation", label);
              if (newName && newName.trim() !== "" && newName !== label) {
                onRename(newName.trim());
              }
            }}>
              <Pencil className="mr-2 h-4 w-4" />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-danger focus:bg-danger/10 focus:text-danger" onClick={(e) => {
              e.preventDefault();
              if (window.confirm("Are you sure you want to delete this conversation?")) {
                onDelete();
              }
            }}>
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

const CHAT_PAGE_SIZE = 20;
const DASHBOARD_PREVIEW_COUNT = 3;

function SidebarChatHistory({ onNavigate }: { onNavigate?: () => void }) {
  const { chatVersion } = useAppState();
  const pathname = usePathname();
  const router = useRouter();
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

  const reload = useCallback(async () => {
    setItems([]);
    setCursor(undefined);
    setHasMore(true);
    setError(null);
    setLoading(true);
    try {
      const page = await conversationsApi.list(CHAT_PAGE_SIZE);
      setItems(page.items);
      setCursor(page.pageInfo.nextCursor ?? undefined);
      setHasMore(page.pageInfo.hasMore);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load chats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (chatVersion === 0) return;
    void reload();
  }, [chatVersion, reload]);

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

  const handleRename = async (id: string, newTitle: string) => {
    try {
      await conversationsApi.update(id, { title: newTitle });
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, title: newTitle } : item))
      );
    } catch (err) {
      console.error("Failed to rename conversation", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await conversationsApi.remove(id);
      setItems((current) => current.filter((item) => item.id !== id));
      if (pathname === `/chats/${id}`) {
        router.push("/workspace/new");
      }
    } catch (err) {
      console.error("Failed to delete conversation", err);
    }
  };

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Chats</p>
        <Link
          href="/workspace/new"
          onClick={onNavigate}
          aria-label="New chat"
          title="New chat"
          className="rounded-md p-1 text-faint transition hover:bg-surface-2 hover:text-text"
        >
          <Plus className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="space-y-0.5">
        {loading && !items.length ? <SidebarRowsSkeleton rows={4} /> : null}
        {items.map((item) => (
          <SidebarChatLink
            key={item.id}
            href={`/chats/${item.id}`}
            label={item.title}
            meta={formatRelativeTime(item.lastActivityAt, "")}
            onClick={onNavigate}
            onRename={(newTitle) => void handleRename(item.id, newTitle)}
            onDelete={() => void handleDelete(item.id)}
          />
        ))}
        {!loading && !items.length && !error ? <p className="px-3 py-2 text-xs text-faint">No conversations yet</p> : null}
        {error ? <button type="button" onClick={() => void loadMore()} className="w-full rounded-lg px-3 py-2 text-left text-xs text-danger hover:bg-surface-2">Retry loading chats</button> : null}
        <div ref={loadMoreRef} className="flex min-h-8 items-center justify-center">
          {loading && items.length ? <Spinner size="sm" className="text-faint" label="Loading more chats" /> : null}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Icon rail nav item ------------------------------ */

function IconNavLink({ href, label, icon: Icon, onClick }: {
  href: string; label: string; icon: typeof Home; onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/chats" && pathname.startsWith(`${href}/`));
  return (
    <Tooltip content={label} side="right">
      <Link
        href={href}
        onClick={onClick}
        aria-label={label}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${active ? "bg-accent-soft text-accent-strong" : "text-faint hover:bg-surface-2 hover:text-text"}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
      </Link>
    </Tooltip>
  );
}

function IconNavButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Home; onClick: () => void }) {
  return (
    <Tooltip content={label} side="right">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-text"
      >
        <Icon className="h-4 w-4 shrink-0" />
      </button>
    </Tooltip>
  );
}

/* ----------------------------- Sidebar ---------------------------------- */

interface SidebarProps {
  onNavigate?: () => void;
  onOpenSearch: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  dashboardVersion?: number;
}

function Sidebar({ onNavigate, onOpenSearch, collapsed, onToggleCollapse, dashboardVersion = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [dashboardItems, setDashboardItems] = useState<DashboardListItem[]>([]);
  const [dashboardsLoading, setDashboardsLoading] = useState(false);

  useEffect(() => {
    setDashboardsLoading(true);
    dashboardsApi.list(100)
      .then((result) => { setDashboardItems(result.items ?? []); })
      .catch(() => { setDashboardItems([]); })
      .finally(() => { setDashboardsLoading(false); });
  }, [dashboardVersion]); // re-fetch when a new dashboard is created

  const allDashboards = dashboardItems;
  const visibleDashboards = allDashboards.slice(0, DASHBOARD_PREVIEW_COUNT);
  const hasMoreDashboards = allDashboards.length > DASHBOARD_PREVIEW_COUNT;

  const openSearch = () => {
    onNavigate?.();
    onOpenSearch();
  };

  if (collapsed) {
    return (
      <aside className="flex h-full flex-col items-center bg-bg py-3">
        <Tooltip content="Expand sidebar" side="right">
          <button
            type="button"
            aria-label="Expand sidebar"
            onClick={onToggleCollapse}
            className="group mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm transition hover:bg-surface-2 hover:text-text"
          >
            <BrandMark className="size-9 rounded-lg group-hover:hidden" />
            <ChevronRight className="hidden h-4 w-4 group-hover:block" />
          </button>
        </Tooltip>

        {/* Nav icons */}
        <div className="flex flex-col items-center gap-1">
          <IconNavLink href="/workspace/new" label="Home" icon={Home} onClick={onNavigate} />
          <IconNavButton label="Search chats" icon={Search} onClick={openSearch} />
          <IconNavLink href="/connections" label="Connections" icon={Database} onClick={onNavigate} />
        </div>

        <div className="my-3 h-px w-8 bg-border" />

        {/* New chat */}
        <Tooltip content="New chat" side="right">
          <Link
            href="/workspace/new"
            onClick={onNavigate}
            aria-label="New chat"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-text"
          >
            <Pencil className="h-4 w-4" />
          </Link>
        </Tooltip>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User at bottom */}
        <div className="flex flex-col items-center gap-2 pb-1">
          <AccountMenu iconOnly />
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col bg-bg p-3">
      <div className="flex items-center justify-between px-2 py-3">
        <Link href="/workspace/new" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5 font-syne text-lg font-semibold tracking-tight">
          <BrandMark className="size-8" />
          <span className="truncate">QueryWise</span>
        </Link>
        <button
          type="button"
          aria-label="Collapse sidebar"
          onClick={onToggleCollapse}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-text"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border pb-4">
        <p className="mb-1 mt-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Main</p>
        <nav className="space-y-1">
          <NavLink href="/workspace/new" label="Home" icon={Home} onClick={onNavigate} />
          <NavButton label="Search chats" icon={Search} onClick={openSearch} />
          <NavLink href="/connections" label="Connections" icon={Database} onClick={onNavigate} />
        </nav>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
        <section className="border-b border-border pb-4">
          <div className="mb-1.5 flex items-center justify-between px-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Dashboards</p>
            <Link
              href="/dashboards"
              onClick={onNavigate}
              aria-label="Create or manage dashboards"
              title="Create or manage dashboards"
              className="rounded-md p-1 text-faint transition hover:bg-surface-2 hover:text-text"
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
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs transition ${pathname === `/dashboards/${item.id}` ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-2 hover:text-text"}`}
              >
                <BarChart3 className={`h-3.5 w-3.5 shrink-0 ${pathname === `/dashboards/${item.id}` ? "text-accent-strong" : "text-faint group-hover:text-muted"}`} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.widgetCount ? <span className="shrink-0 text-[10px] text-faint">{item.widgetCount}</span> : null}
              </Link>
            ))}
            {dashboardsLoading && !allDashboards.length ? <SidebarRowsSkeleton rows={3} /> : null}
            {!dashboardsLoading && !allDashboards.length ? <Link href="/dashboards" onClick={onNavigate} className="block rounded-lg px-3 py-2 text-xs text-faint hover:bg-surface-2 hover:text-text">Create your first dashboard</Link> : null}
            {hasMoreDashboards ? (
              <Link href="/dashboards" onClick={onNavigate} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-faint transition hover:text-text">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </section>
        <SidebarChatHistory onNavigate={onNavigate} />
      </div>
      <div className="mt-3 px-2 pb-3">
        <AccountMenu />
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useLocalStorage<boolean>("querywise.sidebar.collapsed", false);
  const { dashboardVersion } = useAppState();

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
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <div
        className={`hidden flex-shrink-0 border-r border-border transition-all duration-200 lg:block ${collapsed ? "w-[52px]" : "w-[240px]"}`}
      >
        <div className="sticky top-0 h-screen">
          <Sidebar
            onOpenSearch={() => setSearchOpen(true)}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
            dashboardVersion={dashboardVersion}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-3 backdrop-blur lg:hidden">
          <button aria-label="Open navigation" onClick={() => setNavOpen(true)} className="rounded-lg border border-border p-2"><Menu className="h-4 w-4" /></button>
          <span className="flex items-center gap-2 font-syne font-semibold"><BrandMark className="size-7" />QueryWise</span>
          <span className="h-9 w-9" />
        </div>
        <main className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen">{children}</main>
      </div>

      <ChatSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {navOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} aria-label="Close navigation" />
          <div className="relative h-full w-[86vw] max-w-[300px]">
            <Sidebar
              onNavigate={() => setNavOpen(false)}
              onOpenSearch={() => setSearchOpen(true)}
              collapsed={false}
              onToggleCollapse={() => {}}
              dashboardVersion={dashboardVersion}
            />
            <button aria-label="Close navigation" className="absolute right-2 top-2 p-2" onClick={() => setNavOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
