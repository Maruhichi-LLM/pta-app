"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApprovalDisplay = {
  id: number;
  action: "APPROVED" | "REJECTED";
  comment?: string | null;
  createdAt: string;
  actedBy: {
    id: number;
    displayName: string;
  };
};

export type LedgerDisplay = {
  id: number;
  title: string;
  amount: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  receiptUrl?: string | null;
  notes?: string | null;
  createdAt: string;
  createdBy: {
    id: number;
    displayName: string;
  };
  approvals: ApprovalDisplay[];
};

type Props = {
  ledgers: LedgerDisplay[];
  canApprove: boolean;
};

export function LedgerList({ ledgers, canApprove }: Props) {
  if (ledgers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
        まだ会計データがありません。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {ledgers.map((ledger) => (
        <article
          key={ledger.id}
          className="rounded-2xl border border-zinc-200 p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                {new Intl.DateTimeFormat("ja-JP", {
                  timeZone: "Asia/Tokyo",
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(ledger.createdAt))}
              </p>
              <h3 className="text-xl font-semibold text-zinc-900">
                {ledger.title}
              </h3>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-900">
                ¥{ledger.amount.toLocaleString()}
              </p>
              <p
                className={`text-sm font-medium ${
                  ledger.status === "APPROVED"
                    ? "text-green-600"
                    : ledger.status === "REJECTED"
                    ? "text-red-600"
                    : "text-amber-600"
                }`}
              >
                {statusLabel(ledger.status)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            登録者: {ledger.createdBy.displayName}
          </p>
          {ledger.receiptUrl ? (
            <p className="mt-2 text-sm">
              証憑:{" "}
              <a
                href={ledger.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 underline"
              >
                {ledger.receiptUrl}
              </a>
            </p>
          ) : null}
          {ledger.notes ? (
            <p className="mt-2 text-sm text-zinc-600">メモ: {ledger.notes}</p>
          ) : null}

          {ledger.status === "PENDING" && canApprove ? (
            <ApprovalActions ledgerId={ledger.id} />
          ) : null}

          {ledger.approvals.length > 0 ? (
            <div className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
              <p className="font-medium text-zinc-700">承認ログ</p>
              <ul className="mt-2 space-y-2">
                {ledger.approvals.map((approval) => (
                  <li key={approval.id}>
                    {new Intl.DateTimeFormat("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(approval.createdAt))}{" "}
                    -{" "}
                    {approval.actedBy.displayName}{" "}
                    {approval.action === "APPROVED" ? "承認" : "却下"}{" "}
                    {approval.comment ? `(${approval.comment})` : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function statusLabel(status: LedgerDisplay["status"]) {
  switch (status) {
    case "APPROVED":
      return "承認済み";
    case "REJECTED":
      return "却下";
    default:
      return "承認待ち";
  }
}

function ApprovalActions({ ledgerId }: { ledgerId: number }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<"approve" | "reject" | null>(
    null
  );

  async function handleAction(action: "approve" | "reject") {
    setIsSubmitting(action);
    setError(null);
    try {
      const response = await fetch(`/api/ledger/${ledgerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          comment: comment || undefined,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "処理に失敗しました。");
        return;
      }
      setComment("");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(null);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        placeholder="コメント（任意）"
        rows={2}
      />
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleAction("approve")}
          disabled={isSubmitting !== null}
          className="flex-1 rounded-lg bg-emerald-600 py-2 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting === "approve" ? "承認中..." : "承認"}
        </button>
        <button
          type="button"
          onClick={() => handleAction("reject")}
          disabled={isSubmitting !== null}
          className="flex-1 rounded-lg bg-red-600 py-2 text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting === "reject" ? "却下中..." : "却下"}
        </button>
      </div>
    </div>
  );
}
