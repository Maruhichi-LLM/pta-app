import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ROLE_ADMIN } from "@/lib/roles";
import { RouteCreateForm } from "./route-create-form";
import { RouteDeleteButton } from "./route-delete-button";

export default async function ApprovalRoutesPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "approval");

  const [member, routes] = await Promise.all([
    prisma.member.findUnique({
      where: { id: session.memberId },
      select: { role: true },
    }),
    prisma.approvalRoute.findMany({
      where: { groupId: session.groupId },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        _count: { select: { templates: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const isAdmin = member?.role === ROLE_ADMIN;

  return (
    <div className="min-h-screen bg-transparent py-10">
      <div className="page-shell space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Knot Workflow
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">承認ルート管理</h1>
          <p className="mt-2 text-sm text-zinc-600">
            申請テンプレートで利用する承認ステップを定義します。
          </p>
        </header>

        {isAdmin ? (
          <RouteCreateForm />
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
            承認ルートの作成は管理者のみが実行できます。
          </p>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">既存ルート</h2>
          {routes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-500">
              まだ承認ルートがありません。
            </p>
          ) : (
            routes.map((route) => (
              <article
                key={route.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-zinc-900">
                      {route.name}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      ステップ {route.steps.length} 件 ・ 利用テンプレート{" "}
                      {route._count.templates} 件
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>作成日: {route.createdAt.toLocaleString("ja-JP")}</span>
                    {isAdmin ? <RouteDeleteButton routeId={route.id} /> : null}
                  </div>
                </div>
                <ol className="mt-4 space-y-2 text-sm text-zinc-700">
                  {route.steps.map((step) => (
                    <li
                      key={step.id}
                      className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
                    >
                      <span className="font-semibold text-zinc-900">
                        STEP {step.stepOrder}:
                      </span>{" "}
                      {step.approverRole}
                      {step.requireAll ? "（全員承認）" : ""}
                    </li>
                  ))}
                </ol>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
