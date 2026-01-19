"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LedgerCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          amount: Number(amount),
          receiptUrl,
          notes,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "登録に失敗しました。");
        return;
      }
      setTitle("");
      setAmount("");
      setReceiptUrl("");
      setNotes("");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-zinc-200 p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-zinc-900">会計の登録</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-zinc-600">
          内容
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="例: 備品購入"
            required
          />
        </label>
        <label className="text-sm text-zinc-600">
          金額（円）
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="12000"
            required
            min={1}
          />
        </label>
      </div>
      <label className="mt-4 block text-sm text-zinc-600">
        証憑URL（任意）
        <input
          value={receiptUrl}
          onChange={(e) => setReceiptUrl(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="https://example.com/receipt"
        />
      </label>
      <label className="mt-4 block text-sm text-zinc-600">
        メモ
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          rows={3}
        />
      </label>
      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 w-full rounded-lg bg-sky-600 py-2 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
      >
        {isSubmitting ? "登録中..." : "登録する"}
      </button>
    </form>
  );
}
