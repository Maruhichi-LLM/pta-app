"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ConversionTarget = "todo" | "accounting" | "document" | "voting";

const ACTION_LABELS: Record<ConversionTarget, string> = {
  todo: "ToDoに変換",
  accounting: "会計の下書きに変換",
  document: "議事録として保存",
  voting: "投票にする",
};

const RESULT_LABELS: Record<ConversionTarget, string> = {
  todo: "ToDo",
  accounting: "会計下書き",
  document: "議事録",
  voting: "投票",
};

const ENDPOINTS: Record<Exclude<ConversionTarget, "voting">, string> = {
  todo: "/api/chat/convert/todo",
  accounting: "/api/chat/convert/accounting-draft",
  document: "/api/chat/convert/meeting-note",
};

type Props = {
  messageId: number;
  messageBody: string;
  threadId: number;
  convertedTargets: Record<ConversionTarget, boolean>;
  menuAlign?: "left" | "right";
};

type ConversionResponse = {
  target: Exclude<ConversionTarget, "voting">;
  status: "created" | "exists";
  url?: string;
};

type VotingCreateResponse = {
  voting?: { id: number };
  error?: string;
};

const DEFAULT_VOTING_OPTIONS = ["賛成", "反対", "保留"];
const OPTION_LIMIT = 10;
const OPTION_MIN = 2;

function summarize(text: string, length = 40) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= length) return trimmed;
  return `${trimmed.slice(0, length - 1)}…`;
}

export function ChatMessageActions({
  messageId,
  messageBody,
  threadId,
  convertedTargets,
  menuAlign = "right",
}: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<ConversionTarget | null>(null);
  const [feedback, setFeedback] = useState<ConversionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState(convertedTargets);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [votingTitle, setVotingTitle] = useState(
    summarize(messageBody) || "投票タイトル"
  );
  const [votingDescription, setVotingDescription] = useState("");
  const [votingDeadline, setVotingDeadline] = useState("");
  const [votingOptions, setVotingOptions] = useState<string[]>(
    DEFAULT_VOTING_OPTIONS
  );

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [menuOpen]);

  const triggerConversion = useCallback(
    async (target: Exclude<ConversionTarget, "voting">) => {
      setPending(target);
      setError(null);
      setFeedback(null);
      try {
        const endpoint = ENDPOINTS[target];
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatMessageId: messageId }),
        });
        const data = (await response.json().catch(() => ({}))) as
          | ConversionResponse
          | { error?: string };
        if (!response.ok || !data) {
          setError("変換に失敗しました。");
          return;
        }
        if ("error" in data) {
          setError(data.error ?? "変換に失敗しました。");
          return;
        }
        if (!("target" in data) || !data.target) {
          setError("変換に失敗しました。");
          return;
        }
        setState((prev) => ({ ...prev, [target]: true }));
        setFeedback(data);
      } catch {
        setError("通信エラーが発生しました。");
      } finally {
        setPending(null);
        setMenuOpen(false);
      }
    },
    [messageId]
  );

  function updateOption(index: number, value: string) {
    setVotingOptions((prev) =>
      prev.map((option, idx) => (idx === index ? value : option))
    );
  }

  function addOption() {
    if (votingOptions.length >= OPTION_LIMIT) return;
    setVotingOptions((prev) => [...prev, ""]);
  }

  function removeOption(index: number) {
    if (votingOptions.length <= OPTION_MIN) return;
    setVotingOptions((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleVotingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = votingTitle.trim();
    if (!title) {
      setError("タイトルを入力してください。");
      return;
    }
    const normalizedOptions = votingOptions
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
    if (normalizedOptions.length < OPTION_MIN) {
      setError("選択肢を2つ以上入力してください。");
      return;
    }

    let deadlinePayload: string | null = null;
    if (votingDeadline) {
      const parsed = new Date(votingDeadline);
      if (Number.isNaN(parsed.getTime())) {
        setError("締切日時を正しく入力してください。");
        return;
      }
      deadlinePayload = parsed.toISOString();
    }

    setPending("voting");
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/voting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: votingDescription.trim() || null,
          options: normalizedOptions.map((label) => ({ label })),
          deadlineAt: deadlinePayload,
          sourceThreadId: threadId,
          sourceChatMessageId: messageId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as
        | VotingCreateResponse
        | { error?: string };
      if (!response.ok || !data) {
        setError("投票の作成に失敗しました。");
        return;
      }
      if ("error" in data && data.error) {
        setError(data.error);
        return;
      }
      if ("voting" in data && data.voting?.id) {
        setState((prev) => ({ ...prev, voting: true }));
        setShowVotingModal(false);
        router.refresh();
      } else {
        setError("投票の作成に失敗しました。");
      }
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setPending(null);
      setMenuOpen(false);
    }
  }

  const alignRight = menuAlign === "right";

  return (
    <div
      className={`flex flex-col gap-2 text-xs text-zinc-600 ${
        alignRight ? "items-end" : "items-start"
      }`}
    >
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          className="rounded-full border border-zinc-200 px-2 py-1 text-base leading-none text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          ︙
        </button>
        {menuOpen ? (
          <div
            className={`absolute top-1/2 z-10 w-48 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white p-2 text-sm shadow-lg ${
              alignRight ? "right-full mr-3" : "left-full ml-3"
            }`}
          >
            {(Object.keys(ACTION_LABELS) as Array<ConversionTarget>).map(
              (target) => {
                if (target === "voting") {
                  return (
                    <button
                      key={target}
                      type="button"
                      onClick={() => setShowVotingModal(true)}
                      disabled={state[target] || pending !== null}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left ${
                        state[target]
                          ? "text-zinc-400"
                          : "text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      <span>{ACTION_LABELS[target]}</span>
                      {state[target] ? (
                        <span className="text-xs">済</span>
                      ) : pending === target ? (
                        <span className="text-xs text-sky-600">処理中</span>
                      ) : null}
                    </button>
                  );
                }
                return (
                  <button
                    key={target}
                    type="button"
                    onClick={() => triggerConversion(target)}
                    disabled={state[target] || pending !== null}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left ${
                      state[target]
                        ? "text-zinc-400"
                        : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <span>{ACTION_LABELS[target]}</span>
                    {state[target] ? (
                      <span className="text-xs">済</span>
                    ) : pending === target ? (
                      <span className="text-xs text-sky-600">処理中</span>
                    ) : null}
                  </button>
                );
              }
            )}
          </div>
        ) : null}
      </div>
      {feedback ? (
        <p className="text-xs text-emerald-700">
          {RESULT_LABELS[feedback.target]}
          {feedback.status === "exists" ? "は既に作成済みです。" : "を作成しました。"}
          {feedback.url ? (
            <>
              {" "}
              <Link href={feedback.url} className="underline">
                開く
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {showVotingModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-zinc-900">
              投票を作成
            </h2>
            <form onSubmit={handleVotingSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-700">
                  投票タイトル <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={votingTitle}
                  onChange={(event) => setVotingTitle(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  disabled={pending === "voting"}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-700">
                  説明
                </label>
                <textarea
                  value={votingDescription}
                  onChange={(event) =>
                    setVotingDescription(event.target.value)
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  disabled={pending === "voting"}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-700">
                  選択肢
                </label>
                <div className="mt-2 space-y-2">
                  {votingOptions.map((option, index) => (
                    <div key={`${index}`} className="flex gap-2">
                      <input
                        type="text"
                        value={option}
                        onChange={(event) =>
                          updateOption(index, event.target.value)
                        }
                        className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        disabled={pending === "voting"}
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        disabled={
                          pending === "voting" ||
                          votingOptions.length <= OPTION_MIN
                        }
                        className="rounded-full border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addOption}
                    disabled={
                      pending === "voting" ||
                      votingOptions.length >= OPTION_LIMIT
                    }
                    className="inline-flex rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    + 選択肢を追加
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-700">
                  締切（任意）
                </label>
                <input
                  type="datetime-local"
                  value={votingDeadline}
                  onChange={(event) => setVotingDeadline(event.target.value)}
                  className="mt-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  disabled={pending === "voting"}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowVotingModal(false)}
                  disabled={pending === "voting"}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={pending === "voting"}
                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending === "voting" ? "作成中..." : "投票を作成"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
