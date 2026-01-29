import { redirect } from "next/navigation";
import { ThreadSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { RelatedThreadButton } from "@/components/related-thread-button";
import { TodoStatusSelector } from "@/components/todo-status-selector";
import { TodoCreateButton } from "@/components/todo-create-button";
import { GroupAvatar } from "@/components/group-avatar";

type TodoPageProps = {
  searchParams?: Promise<{
    focus?: string;
  }>;
};

export default async function TodoPage({ searchParams }: TodoPageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "todo");

  const [group, todos, members] = await Promise.all([
    prisma.group.findUnique({
      where: { id: session.groupId },
      select: { name: true, logoUrl: true },
    }),
    prisma.todoItem.findMany({
      where: { groupId: session.groupId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        assignedTo: { select: { id: true, displayName: true } },
      },
    }),
    prisma.member.findMany({
      where: { groupId: session.groupId },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);
  if (!group) {
    redirect("/join");
  }
  const resolvedParams = (await searchParams) ?? {};
  const focusId = Number(resolvedParams.focus ?? "");

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <header className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center gap-4">
            <GroupAvatar
              name={group.name}
              logoUrl={group.logoUrl}
              sizeClassName="h-12 w-12"
            />
            <div>
              <p className="text-sm uppercase tracking-wide text-zinc-500">
                Knot ToDo
              </p>
              <h1 className="text-3xl font-semibold text-zinc-900">
                決まったことを、ちゃんと終わらせる。
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                チャットや決定事項を、担当・期限つきの実行タスクとして管理する。
              </p>
            </div>
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex justify-end">
            <TodoCreateButton members={members} />
          </div>
          {todos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              まだToDoはありません。上の「新規作成」ボタンまたはKnot Chatから変換するとここに表示されます。
            </p>
          ) : (
            todos.map((todo) => {
              const isFocused = Number.isInteger(focusId) && focusId === todo.id;
              return (
                <article
                  key={todo.id}
                  id={`todo-${todo.id}`}
                  className={`rounded-2xl border bg-white/90 p-6 shadow-sm ${
                    isFocused ? "ring-2 ring-sky-300" : "border-zinc-200"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-zinc-400">
                        {new Intl.DateTimeFormat("ja-JP", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(todo.createdAt)}
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-zinc-900">
                        {todo.title}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-600">
                        登録者: {todo.createdBy.displayName}
                      </p>
                      {todo.assignedTo ? (
                        <p className="text-sm text-zinc-600">
                          担当: {todo.assignedTo.displayName}
                        </p>
                      ) : (
                        <p className="text-sm text-zinc-500">担当: 未設定</p>
                      )}
                      {todo.body ? (
                        <p className="mt-3 whitespace-pre-line text-sm text-zinc-800">
                          {todo.body}
                        </p>
                      ) : null}
                    </div>
                    <TodoStatusSelector
                      todoId={todo.id}
                      currentStatus={todo.status}
                    />
                  </div>
                  <RelatedThreadButton
                    groupId={session.groupId}
                    sourceType={ThreadSourceType.TODO}
                    sourceId={todo.id}
                    title={`ToDo: ${todo.title}`}
                    threadId={todo.sourceThreadId ?? null}
                    className="mt-4"
                  />
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
