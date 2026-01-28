"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AllModuleKey } from "@/lib/modules";

export type StoreEntryState =
  | "available"
  | "system"
  | "beta"
  | "comingSoon"
  | "paid"
  | "locked";

export type StoreEntry = {
  key?: AllModuleKey;
  title: string;
  description: string;
  badge?: string;
  state: StoreEntryState;
  toggleable: boolean;
  note?: string;
};

type Props = {
  entries: StoreEntry[];
  enabledKeys: AllModuleKey[];
  isAdmin: boolean;
};

const STATE_LABELS: Record<StoreEntryState, string> = {
  available: "AVAILABLE",
  system: "SYSTEM",
  beta: "BETA",
  comingSoon: "COMING SOON",
  paid: "PAID",
  locked: "LOCKED",
};

export function ModuleStoreGrid({
  entries,
  enabledKeys,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<AllModuleKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(key: AllModuleKey, enable: boolean) {
    if (!isAdmin) return;
    setLoadingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/store/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleKey: key, enable }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "更新に失敗しました");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-4 lg:grid-cols-3 md:grid-cols-2">
        {entries.map((entry) => {
          const metadataState = entry.state ?? "available";
          const statusLabel = entry.toggleable
            ? enabledKeys.includes(entry.key as AllModuleKey)
              ? "Enabled"
              : "Disabled"
            : STATE_LABELS[metadataState];
          const isEnabled =
            !!entry.key && enabledKeys.includes(entry.key as AllModuleKey);
          const isLoading =
            !!entry.key && loadingKey === entry.key;
          const cardMuted =
            metadataState === "comingSoon" ||
            metadataState === "locked" ||
            metadataState === "paid";

          return (
            <div
              key={entry.title + (entry.key ?? "")}
              className={`flex h-full min-h-[300px] flex-col justify-between rounded-3xl border bg-white/80 p-6 shadow-sm backdrop-blur ${
                cardMuted ? "opacity-80" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {entry.badge ?? "Knot Module"}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-zinc-900">
                    {entry.title}
                  </h3>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    entry.toggleable
                      ? isEnabled
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-500"
                      : metadataState === "system"
                      ? "bg-amber-100 text-amber-700"
                      : metadataState === "beta"
                      ? "bg-violet-100 text-violet-700"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
              <div className="mt-4 flex-1 space-y-2 text-sm leading-relaxed text-zinc-600">
                <p>{entry.description}</p>
                {entry.note ? (
                  <p className="text-xs text-amber-600">{entry.note}</p>
                ) : null}
              </div>
              {entry.toggleable && entry.key ? (
                <div className="mt-6">
                  <button
                    type="button"
                    disabled={!isAdmin || isLoading}
                    onClick={() =>
                      handleToggle(entry.key!, !isEnabled)
                    }
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                      isEnabled
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 bg-white text-zinc-600"
                    } ${
                      !isAdmin || isLoading
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-sky-200 hover:bg-sky-50"
                    }`}
                  >
                    <span>{isLoading ? "更新中..." : "モジュール"}</span>
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        isEnabled ? "bg-sky-600" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          isEnabled ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </span>
                  </button>
                  {!isAdmin ? (
                    <p className="text-center text-xs text-zinc-500">
                      管理者のみ操作できます
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
