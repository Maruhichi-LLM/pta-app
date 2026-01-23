import Link from "next/link";
import { redirect } from "next/navigation";
import { ThreadSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ChatInput } from "@/components/chat-input";
import { ChatMessageActions } from "@/components/chat-message-actions";

const SOURCE_TYPE_LABELS: Record<ThreadSourceType, string> = {
  TODO: "ToDo",
  EVENT: "Event",
  ACCOUNTING: "Accounting",
  DOCUMENT: "Document",
  FREE: "FREE",
};

const TODO_STATUS_LABELS = {
  TODO: "未着手",
  IN_PROGRESS: "進行中",
  DONE: "完了",
} as const;

const formatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "short",
  timeStyle: "short",
});

type PageProps = {
  params: Promise<{ threadId: string }>;
  searchParams?: Promise<{ message?: string }>;
};

export default async function ThreadDetailPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "chat");
  const threadId = Number(resolvedParams.threadId);
  if (!Number.isInteger(threadId)) {
    redirect("/chat");
  }

  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, groupId: session.groupId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, displayName: true } },
          todoItems: { select: { id: true } },
          ledgerEntries: { select: { id: true } },
          documents: { select: { id: true } },
        },
      },
    },
  });
  if (!thread) {
    redirect("/chat");
  }

  const [todos] = await Promise.all([
    prisma.todoItem.findMany({
      where: { groupId: session.groupId, sourceThreadId: thread.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const focusedMessageId = Number(resolvedSearchParams?.message ?? "");
  const sourceLink = resolveSourceLink(thread.sourceType, thread.sourceId);

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell flex flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {SOURCE_TYPE_LABELS[thread.sourceType]}
              </p>
              <h1 className="text-3xl font-semibold text-zinc-900">
                {thread.title}
              </h1>
            </div>
            <Link
              href="/chat"
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:border-sky-300 hover:text-sky-600"
            >
              ← Thread一覧
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
            <span>最終更新 {formatter.format(thread.updatedAt)}</span>
            {sourceLink ? (
              <Link
                href={sourceLink}
                className="inline-flex items-center text-sky-600 underline"
              >
                元のモジュールを開く
              </Link>
            ) : null}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
                {thread.messages.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    まだメッセージがありません。最初のアクションを記録しましょう。
                  </p>
                ) : (
                  thread.messages.map((message) => {
                    const isOwn = message.author.id === session.memberId;
                    const isFocused =
                      Number.isInteger(focusedMessageId) &&
                      focusedMessageId === message.id;
                    const bubbleClasses = isOwn
                      ? "bg-sky-600 text-white border-sky-500"
                      : "bg-white text-zinc-800 border-zinc-100";
                    return (
                      <div
                        key={message.id}
                        className={`flex w-full ${
                          isOwn ? "justify-end" : "justify-start"
                        }`}
                      >
                        <article
                          id={`message-${message.id}`}
                          className={`max-w-[75%] rounded-2xl border px-4 py-3 shadow-sm ${
                            isFocused ? "ring-2 ring-sky-300" : ""
                          } ${bubbleClasses}`}
                        >
                          <div
                            className={`flex flex-col text-xs ${
                              isOwn ? "items-end text-white/80" : "text-zinc-500"
                            }`}
                          >
                            <span
                              className={`font-semibold ${
                                isOwn ? "text-white" : "text-zinc-700"
                              }`}
                            >
                              {message.author.displayName}
                            </span>
                            <time dateTime={message.createdAt.toISOString()}>
                              {formatter.format(message.createdAt)}
                            </time>
                          </div>
                          <p
                            className={`mt-2 whitespace-pre-wrap break-words text-sm ${
                              isOwn ? "text-white" : "text-zinc-800"
                            }`}
                          >
                            {message.body}
                          </p>
                          <div className={`mt-3 flex ${isOwn ? "justify-end" : "justify-start"}`}>
                            <ChatMessageActions
                              messageId={message.id}
                              convertedTargets={{
                                todo: message.todoItems.length > 0,
                                accounting: message.ledgerEntries.length > 0,
                                document: message.documents.length > 0,
                              }}
                            />
                          </div>
                        </article>
                      </div>
                    );
                  })
                )}
              </div>
              <ChatInput threadId={thread.id} />
            </div>
          </section>

          <aside className="rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">
              このThreadから生まれたToDo
            </h2>
            {todos.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                まだToDoはありません。決まった内容は即座にToDoへ変換しましょう。
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {todos.map((todo) => (
                  <li key={todo.id} className="rounded-xl border border-zinc-100 p-3 text-sm">
                    <p className="font-semibold text-zinc-800">{todo.title}</p>
                    <p className="text-xs text-zinc-500">
                      {formatter.format(todo.createdAt)} /{" "}
                      {TODO_STATUS_LABELS[todo.status as keyof typeof TODO_STATUS_LABELS] ??
                        todo.status}
                    </p>
                    <Link
                      href={`/todo?focus=${todo.id}`}
                      className="mt-1 inline-flex text-xs text-sky-600 underline"
                    >
                      ToDoを開く
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function resolveSourceLink(sourceType: ThreadSourceType, sourceId: number | null) {
  if (!sourceId) {
    return null;
  }
  switch (sourceType) {
    case ThreadSourceType.TODO:
      return `/todo?focus=${sourceId}`;
    case ThreadSourceType.ACCOUNTING:
      return `/ledger?focus=${sourceId}`;
    case ThreadSourceType.DOCUMENT:
      return `/documents/${sourceId}`;
    case ThreadSourceType.EVENT:
      return `/events`;
    default:
      return null;
  }
}
