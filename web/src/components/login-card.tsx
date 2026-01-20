"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Props = {
  heading?: string;
  showRegisterHint?: boolean;
  onSuccessHref?: string;
  compact?: boolean;
};

export function LoginCard({
  heading = "ログイン",
  showRegisterHint = true,
  onSuccessHref = "/calendar",
  compact = false,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "ログインに失敗しました。");
        return;
      }
      router.push(onSuccessHref);
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm ${
        compact ? "text-sm" : ""
      }`}
    >
      <h2 className="mb-4 text-2xl font-semibold text-zinc-900">{heading}</h2>
      <label className="mb-4 block text-sm font-medium text-zinc-700">
        メールアドレス
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="you@example.com"
          required
        />
      </label>
      <label className="mb-4 block text-sm font-medium text-zinc-700">
        パスワード
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="●●●●●●●●"
          required
        />
      </label>
      {error ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-sky-600 py-2 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
      >
        {isSubmitting ? "送信中..." : "ログイン"}
      </button>
      {showRegisterHint ? (
        <p className="mt-4 text-center text-sm text-zinc-600">
          団体を新しく登録する場合は{" "}
          <Link href="/register" className="text-sky-600 underline">
            団体登録
          </Link>
          から始めてください。
        </p>
      ) : null}
    </form>
  );
}
