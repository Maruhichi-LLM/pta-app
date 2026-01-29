import Link from "next/link";
import { redirect } from "next/navigation";
import { ThreadSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ensureFreeThread } from "@/lib/chat";
import { ThreadStatusToggle } from "@/components/thread-status-toggle";
import { GroupAvatar } from "@/components/group-avatar";

const SOURCE_TYPE_LABELS: Record<ThreadSourceType, string> = {
  TODO: "ToDo",
  EVENT: "Event",
  ACCOUNTING: "Accounting",
  DOCUMENT: "Document",
  VOTING: "Voting",
  RECORD: "Record",
  FREE: "FREE",
};

const formatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function ChatPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "chat");
  await ensureFreeThread(session.groupId);

  const [group, threads] = await Promise.all([
    prisma.group.findUnique({
      where: { id: session.groupId },
      select: { name: true, logoUrl: true },
    }),
    prisma.chatThread.findMany({
      where: { groupId: session.groupId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    }),
  ]);
  if (!group) {
    redirect("/join");
  }

  const freeThread = threads.find(
    (thread) => thread.sourceType === ThreadSourceType.FREE
  );

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell flex flex-col gap-8">
        <header className="rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <GroupAvatar
              name={group.name}
              logoUrl={group.logoUrl}
              sizeClassName="h-12 w-12"
            />
            <div>
              <p className="text-sm uppercase tracking-wide text-sky-600">
                Knot Chat
              </p>
              <h1 className="text-3xl font-semibold text-zinc-900">
                話したことを、すべての始まりに。
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                団体の会話を起点に、ToDo・会計・記録へそのまま変換できる意思決定ハブ。
              </p>
            </div>
          </div>
          {freeThread ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-zinc-500">雑談・検討用スレッド</span>
              <Link
                href={`/threads/${freeThread.id}`}
                className="inline-flex rounded-full bg-sky-600 px-4 py-1 text-sm font-semibold text-white hover:bg-sky-700"
              >
                FREEスレッドを開く
              </Link>
            </div>
          ) : null}
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">
                スレッドをひらく
              </h2>
              <p className="text-sm text-zinc-600">
                最新の更新順で並びます。ToDo・会計・ドキュメントなどから自動生成されたスレッドもここに集まります。
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {threads.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
                まだThreadがありません。ToDoや会計の画面から「この件について話す」を押すと案件Threadが生成されます。
              </p>
            ) : (
              threads.map((thread) => (
                <div
                  key={thread.id}
                  className="rounded-2xl border border-zinc-200 p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.7rem] text-zinc-600">
                          {SOURCE_TYPE_LABELS[thread.sourceType]}
                        </span>
                        <span className="text-zinc-400">
                          {formatter.format(thread.updatedAt)} 更新
                        </span>
                      </div>
                      <Link href={`/threads/${thread.id}`}>
                        <h3 className="mt-1 text-lg font-semibold text-zinc-900 hover:text-sky-600 transition">
                          {thread.title}
                        </h3>
                      </Link>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm text-zinc-500">
                        <p>メッセージ {thread._count.messages}</p>
                      </div>
                      <ThreadStatusToggle
                        threadId={thread.id}
                        currentStatus={thread.status}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
