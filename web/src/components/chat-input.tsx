"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ChatInput() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) {
      setError("メッセージを入力してください。");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "送信に失敗しました。");
        return;
      }
      setBody("");
      router.refresh();
    } catch (err) {
      setError("送信時にエラーが発生しました。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        className="w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        rows={3}
        placeholder="ここに意思決定につながるメッセージを残しましょう。"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={pending}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {pending ? "送信中…" : "送信"}
        </button>
      </div>
    </form>
  );
}
