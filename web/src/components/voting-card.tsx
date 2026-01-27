"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VotingAnonymousBanner } from "@/components/voting-anonymous-banner";

type VotingOption = { id: string; label: string };

type VotingApiResponse = {
  voting: {
    id: number;
    title: string;
    description?: string | null;
    options: VotingOption[];
    deadlineAt?: string | null;
    status: "OPEN" | "CLOSED";
    totalVotes: number;
    results?: Record<string, number> | null;
    threadId?: number | null;
    createdByMemberId: number;
  };
  comments: Array<{ id: number; body: string; createdAt: string }>;
  hasVoted: boolean;
  canManage: boolean;
};

type TodoConversionResponse = {
  status: "created" | "exists";
  url?: string;
  error?: string;
};

type Props = {
  votingId: number;
  showChatConvert?: boolean;
};

const formatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function VotingCard({ votingId, showChatConvert = false }: Props) {
  const [data, setData] = useState<VotingApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [todoLink, setTodoLink] = useState<string | null>(null);

  const fetchVoting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/voting/${votingId}`);
      const payload = (await response.json().catch(() => null)) as
        | VotingApiResponse
        | { error?: string }
        | null;
      if (!response.ok || !payload) {
        setError("投票の取得に失敗しました。");
        return;
      }
      if ("error" in payload && payload.error) {
        setError(payload.error);
        return;
      }
      setData(payload as VotingApiResponse);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [votingId]);

  useEffect(() => {
    fetchVoting();
  }, [fetchVoting]);

  const options = useMemo(
    () => data?.voting?.options ?? [],
    [data?.voting?.options]
  );

  async function handleVote(choiceId: string) {
    setPending("vote");
    setError(null);
    try {
      const response = await fetch(`/api/voting/${votingId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choiceId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "投票に失敗しました。");
        return;
      }
      await fetchVoting();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setPending(null);
    }
  }

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentBody.trim()) {
      setError("コメントを入力してください。");
      return;
    }
    setPending("comment");
    setError(null);
    try {
      const response = await fetch(`/api/voting/${votingId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "コメントに失敗しました。");
        return;
      }
      setCommentBody("");
      await fetchVoting();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setPending(null);
    }
  }

  async function handleClose() {
    const confirmed = window.confirm(
      "締切ると、以後投票できません。集計結果は閲覧できます。（匿名性は変わりません）"
    );
    if (!confirmed) return;
    setPending("close");
    setError(null);
    try {
      const response = await fetch(`/api/voting/${votingId}/close`, {
        method: "PATCH",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "締切に失敗しました。");
        return;
      }
      await fetchVoting();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setPending(null);
    }
  }

  async function handleConvertToTodo() {
    setPending("todo");
    setError(null);
    setTodoLink(null);
    try {
      const response = await fetch(`/api/voting/${votingId}/convert-to-todo`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as
        | TodoConversionResponse
        | { error?: string };
      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : "ToDo化に失敗しました。";
        setError(message);
        return;
      }
      if ("url" in payload && payload.url) {
        setTodoLink(payload.url);
      }
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setPending(null);
    }
  }

  async function handleConvertToChat() {
    const confirmed = window.confirm(
      "チャットに移行しますか？\n投票結果（集計）と匿名コメントを、新しいチャットスレッドにまとめます。\n投票の匿名性は保たれます（誰が投票したかは表示されません）。"
    );
    if (!confirmed) return;
    setPending("chat");
    setError(null);
    try {
      const response = await fetch(`/api/voting/${votingId}/convert-to-chat`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        thread?: { id: number };
      };
      if (!response.ok) {
        setError(payload.error ?? "チャット移行に失敗しました。");
        return;
      }
      await fetchVoting();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-500">投票を読み込み中...</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-red-600">投票を表示できません。</p>
      </section>
    );
  }

  const { voting, comments, hasVoted, canManage } = data;
  const resultMap = voting.results ?? {};

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-zinc-900">
            {voting.title}
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              voting.status === "CLOSED"
                ? "bg-zinc-100 text-zinc-600"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {voting.status === "CLOSED" ? "締切済み" : "受付中"}
          </span>
        </div>
        {voting.description ? (
          <p className="text-sm text-zinc-600">{voting.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
          <span>
            締切:{" "}
            {voting.deadlineAt
              ? formatter.format(new Date(voting.deadlineAt))
              : "なし"}
          </span>
          <span>投票数: {voting.totalVotes}</span>
        </div>
      </header>

      <VotingAnonymousBanner />

      {voting.status === "OPEN" && !hasVoted ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            あなたの1票を選んでください
          </h3>
          <p className="text-xs text-zinc-600">
            匿名で投票できます。投票後は変更できません。
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleVote(option.id)}
                disabled={pending !== null}
                className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-lg font-semibold text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending === "vote" ? "送信中..." : option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hasVoted ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <p className="text-sm font-semibold">投票しました（匿名）</p>
          <p className="mt-1 text-xs">
            補足があれば、匿名コメントを残せます。その後、必要ならチャットで整理できます。
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-900">
          {voting.status === "CLOSED" ? "最終結果（締切済み）" : "現在の集計"}
        </h3>
        <p className="text-xs text-zinc-600">
          表示されるのは票数のみです（誰が投票したかは表示されません）。
        </p>
        <div className="space-y-2">
          {options.map((option) => (
            <div
              key={option.id}
              className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-2 text-sm"
            >
              <span className="text-zinc-700">{option.label}</span>
              <span className="font-semibold text-zinc-900">
                {resultMap[option.id] ?? 0}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-2 text-sm text-zinc-600">
            <span>合計</span>
            <span className="font-semibold text-zinc-900">
              {voting.totalVotes}
            </span>
          </div>
        </div>
      </div>

      {(hasVoted || voting.status === "CLOSED") && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">
            匿名コメント（任意）
          </h3>
          <p className="text-xs text-zinc-600">
            コメントは匿名で投稿されます。個人が特定される情報は書かないでください。
          </p>
          <form onSubmit={handleCommentSubmit} className="space-y-3">
            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder={`例）賛成だけど、予算面が少し不安です\n例）反対。日程が合わない人が多いと思います`}
              rows={3}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              disabled={pending === "comment"}
            />
            <button
              type="submit"
              disabled={pending === "comment"}
              className="inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "comment" ? "送信中..." : "匿名でコメントする"}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-900">匿名コメント一覧</h3>
        {comments.length === 0 ? (
          <p className="text-sm text-zinc-500">まだ匿名コメントはありません。</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-700"
              >
                <p className="whitespace-pre-line">{comment.body}</p>
                <p className="mt-2 text-xs text-zinc-400">
                  {formatter.format(new Date(comment.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900">管理操作</p>
            <p className="text-xs text-zinc-600">
              投票の締切や結果のToDo化を実行できます。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={voting.status === "CLOSED" || pending !== null}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "close" ? "処理中..." : "投票を締切る"}
            </button>
            <button
              type="button"
              onClick={handleConvertToTodo}
              disabled={pending !== null}
              className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "todo" ? "作成中..." : "結果をToDoにする"}
            </button>
            {showChatConvert ? (
              voting.threadId ? (
                <Link
                  href={`/threads/${voting.threadId}`}
                  className="inline-flex rounded-full border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                >
                  チャットを開く
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleConvertToChat}
                  disabled={pending !== null}
                  className="inline-flex rounded-full border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending === "chat" ? "移行中..." : "投票をチャットに移行"}
                </button>
              )
            ) : null}
          </div>
          {todoLink ? (
            <p className="text-xs text-sky-600">
              ToDoを作成しました。{" "}
              <Link href={todoLink} className="underline">
                開く
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
