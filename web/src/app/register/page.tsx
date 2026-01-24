"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KNOT_CALENDAR_PATH } from "@/lib/routes";

export default function RegisterPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState("4");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName,
          fiscalYearStartMonth: Number(fiscalYearStartMonth),
          displayName,
          email,
          password,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "登録に失敗しました。");
        return;
      }

      router.push(KNOT_CALENDAR_PATH);
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl bg-white p-8 shadow"
      >
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">
          団体を登録する
        </h1>
        <label className="mb-4 block text-sm font-medium text-zinc-700">
          団体名
          <input
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="〇〇PTA"
          />
        </label>
        <label className="mb-4 block text-sm font-medium text-zinc-700">
          会計年度の開始月
          <input
            type="number"
            min={1}
            max={12}
            value={fiscalYearStartMonth}
            onChange={(event) => setFiscalYearStartMonth(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
        <label className="mb-4 block text-sm font-medium text-zinc-700">
          代表者の表示名
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="代表者 名前"
          />
        </label>
        <label className="mb-4 block text-sm font-medium text-zinc-700">
          メールアドレス
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="you@example.com"
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
          {isSubmitting ? "登録中..." : "団体を作成する"}
        </button>
        <p className="mt-4 text-center text-sm text-zinc-600">
          既に団体に参加済みの場合は{" "}
          <Link href="/login" className="text-sky-600 underline">
            ログイン
          </Link>
          してください。
        </p>
      </form>
    </div>
  );
}
