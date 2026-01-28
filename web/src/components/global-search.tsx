"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchResult = {
  entityType: string;
  entityId: number;
  title: string | null;
  snippet: string;
  urlPath: string;
  occurredAt: string | null;
  highlights?: string[];
};

type FilterOption = {
  key: string;
  label: string;
  types: string[] | null;
};

const FILTERS: FilterOption[] = [
  { key: "all", label: "All", types: null },
  { key: "chat", label: "Chat", types: ["CHAT_MESSAGE", "CHAT_THREAD"] },
  { key: "todo", label: "ToDo", types: ["TODO"] },
  { key: "event", label: "Event", types: ["EVENT"] },
  { key: "accounting", label: "Accounting", types: ["LEDGER"] },
  { key: "document", label: "Document", types: ["DOCUMENT"] },
];

const ENTITY_LABELS: Record<string, string> = {
  CHAT_MESSAGE: "Chat Message",
  CHAT_THREAD: "Chat Thread",
  TODO: "ToDo",
  EVENT: "Event",
  LEDGER: "Accounting",
  DOCUMENT: "Document",
};

const ENTITY_ORDER = [
  "CHAT_MESSAGE",
  "CHAT_THREAD",
  "TODO",
  "EVENT",
  "LEDGER",
  "DOCUMENT",
];

const formatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, terms: string[]) {
  if (!text) return text;
  if (terms.length === 0) return text;
  const escaped = terms.map(escapeRegExp).join("|");
  if (!escaped) return text;
  const matcher = new RegExp(`(${escaped})`, "gi");
  const tester = new RegExp(`^(${escaped})$`, "i");
  const parts = text.split(matcher);
  return parts.map((part, index) =>
    tester.test(part) ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-amber-100 px-0.5 text-amber-800"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [filterKey, setFilterKey] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [eventId, setEventId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [fiscalYear, setFiscalYear] = useState("");
  const [isMac, setIsMac] = useState(false);

  const activeFilter =
    FILTERS.find((option) => option.key === filterKey) ?? FILTERS[0];

  const groupedResults = useMemo(() => {
    return ENTITY_ORDER.map((entity) => ({
      entity,
      items: results.filter((row) => row.entityType === entity),
    })).filter((group) => group.items.length > 0);
  }, [results]);

  const flatResults = useMemo(() => {
    return groupedResults.flatMap((group) => group.items);
  }, [groupedResults]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (flatResults.length > 0) {
          setActiveIndex((prev) => (prev + 1) % flatResults.length);
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (flatResults.length > 0) {
          setActiveIndex((prev) =>
            prev - 1 < 0 ? flatResults.length - 1 : prev - 1
          );
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const selected = flatResults[activeIndex];
        if (selected) {
          router.push(selected.urlPath);
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatResults, activeIndex, router]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsMac(navigator.platform.toLowerCase().includes("mac"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (activeFilter.types) {
          params.set("types", activeFilter.types.join(","));
        }
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
        if (eventId) params.set("eventId", eventId);
        if (threadId) params.set("threadId", threadId);
        if (fiscalYear) params.set("fiscalYear", fiscalYear);
        params.set("limit", "50");

        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setResults([]);
          return;
        }
        const payload = await response.json();
        setResults(Array.isArray(payload.results) ? payload.results : []);
        setActiveIndex(0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    query,
    open,
    activeFilter,
    fromDate,
    toDate,
    eventId,
    threadId,
    fiscalYear,
  ]);

  const queryTerms = useMemo(() => {
    return query.trim().split(/\s+/).filter(Boolean);
  }, [query]);

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-3 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-100"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <span className="hidden sm:inline">Knot Search</span>
        <span className="inline sm:hidden">Search</span>
        <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-400">
          {isMac ? "⌘" : "Ctrl"}+K
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 py-16"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4">
              <input
                ref={inputRef}
                className="w-full border-none bg-transparent text-base outline-none placeholder:text-zinc-400"
                placeholder="キーワードで横断検索"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {loading ? (
                <span className="text-xs text-zinc-400">Searching...</span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-b border-zinc-200 px-5 py-3">
              {FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setFilterKey(filter.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    filterKey === filter.key
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
              <button
                type="button"
                className="ml-auto text-xs text-zinc-500 hover:text-zinc-800"
                onClick={() => setFiltersOpen((prev) => !prev)}
              >
                {filtersOpen ? "Hide filters" : "More filters"}
              </button>
            </div>

            {filtersOpen ? (
              <div className="grid gap-3 border-b border-zinc-200 px-5 py-4 sm:grid-cols-2">
                <label className="text-xs text-zinc-500">
                  From
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  To
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Event ID
                  <input
                    value={eventId}
                    onChange={(event) => setEventId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="123"
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Thread ID
                  <input
                    value={threadId}
                    onChange={(event) => setThreadId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="456"
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Fiscal Year
                  <input
                    value={fiscalYear}
                    onChange={(event) => setFiscalYear(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="2025"
                  />
                </label>
              </div>
            ) : null}

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {flatResults.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-400">
                  {query.trim()
                    ? "No results. Try a different keyword or filter."
                    : "Start typing to search across Knot."}
                </div>
              ) : (
                <div className="space-y-6">
                  {(() => {
                    let runningIndex = 0;
                    return groupedResults.map((group) => {
                      const groupIndexStart = runningIndex;
                      runningIndex += group.items.length;
                      return (
                        <div key={group.entity} className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                            {ENTITY_LABELS[group.entity] ?? group.entity}
                          </div>
                          <div className="space-y-2">
                            {group.items.map((item, index) => {
                              const flatIndex = groupIndexStart + index;
                              const isActive = flatIndex === activeIndex;
                              const terms =
                                item.highlights && item.highlights.length > 0
                                  ? item.highlights
                                  : queryTerms;
                              return (
                                <button
                                  key={`${item.entityType}-${item.entityId}`}
                                  type="button"
                                  onClick={() => {
                                    router.push(item.urlPath);
                                    setOpen(false);
                                  }}
                                  onMouseEnter={() => setActiveIndex(flatIndex)}
                                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                                    isActive
                                      ? "border-zinc-400 bg-zinc-100"
                                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="text-sm font-semibold text-zinc-800">
                                      {item.title || "(no title)"}
                                    </div>
                                    {item.occurredAt ? (
                                      <div className="text-xs text-zinc-400">
                                        {formatter.format(new Date(item.occurredAt))}
                                      </div>
                                    ) : null}
                                  </div>
                                  {item.snippet ? (
                                    <p className="mt-2 text-sm text-zinc-600">
                                      {highlightText(item.snippet, terms)}
                                    </p>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
