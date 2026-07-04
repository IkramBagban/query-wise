"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Search } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { SearchResultsSkeleton } from "@/components/LoadingSkeletons";
import { formatRelativeTime } from "@/lib/utils";
import { conversationsApi, type ConversationListItem } from "@/lib/api-client";

const SEARCH_FETCH_LIMIT = 100;

export function ChatSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    inputRef.current?.focus();
    if (loaded.current) return;
    loaded.current = true;
    setLoading(true);
    setError(null);
    conversationsApi
      .list(SEARCH_FETCH_LIMIT)
      .then((page) => setItems(page.items))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load chats"))
      .finally(() => setLoading(false));
  }, [open]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => item.title.toLowerCase().includes(term));
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function go(item: ConversationListItem) {
    onOpenChange(false);
    router.push(`/chats/${item.id}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      go(results[activeIndex]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} panelClassName="max-w-xl p-0 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Search className="size-4 shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search chats by title..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="hidden shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint sm:inline">esc</kbd>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-2">
        {loading ? (
          <SearchResultsSkeleton />
        ) : error ? (
          <p className="px-3 py-8 text-center text-sm text-danger">{error}</p>
        ) : !results.length ? (
          <p className="px-3 py-10 text-center text-sm text-faint">
            {query.trim() ? `No chats matching "${query.trim()}"` : "No conversations yet"}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {results.map((item, index) => (
              <li key={item.id}>
                <Link
                  href={`/chats/${item.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    go(item);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${index === activeIndex ? "bg-accent-soft text-accent-strong" : "text-muted"}`}
                >
                  <MessageSquare className={`size-4 shrink-0 ${index === activeIndex ? "text-accent-strong" : "text-faint"}`} />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="shrink-0 text-[10px] text-faint">{formatRelativeTime(item.lastActivityAt, "")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
