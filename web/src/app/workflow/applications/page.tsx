import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ApplicationCreateForm, RouteOption } from "./application-create-form";
import { ApplicationActionButtons } from "./application-action-buttons";
import { DEFAULT_APPROVAL_FORM_SCHEMA } from "@/lib/workflow-schema";

const STATUS_LABELS = {
  DRAFT: "下書き",
  PENDING: "承認待ち",
  APPROVED: "承認済み",
  REJECTED: "差戻し",
} as const;

const STEP_STATUS_LABELS = {
  WAITING: "待機中",
  IN_PROGRESS: "審査中",
  APPROVED: "承認済み",
  REJECTED: "差戻し",
} as const;

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "はい" : "いいえ";
  }
  if (value === null || typeof value === "undefined") {
    return "—";
  }
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  return String(value);
}

export default async function ApprovalApplicationsPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "approval");

  const [member, routes, applications] = await Promise.all([
    prisma.member.findUnique({
      where: { id: session.memberId },
      select: { id: true, role: true, displayName: true },
    }),
    prisma.approvalRoute.findMany({
      where: { groupId: session.groupId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.approvalApplication.findMany({
      where: { groupId: session.groupId },
      orderBy: { createdAt: "desc" },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            fields: true,
            route: { select: { id: true, name: true } },
          },
        },
        applicant: { select: { id: true, displayName: true } },
        assignments: {
          orderBy: { stepOrder: "asc" },
          include: {
            assignedTo: { select: { id: true, displayName: true } },
          },
        },
      },
    }),
  ]);

  const routeOptions: RouteOption[] = routes.map((route) => ({
    id: route.id,
    name: route.name,
  }));

  return (
    <div className="min-h-screen bg-transparent py-10">
      <div className="page-shell space-y-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Knot Workflow
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            申請と承認
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            団体内のあらゆる申請をここに集約し、承認フローや差戻し、履歴管理まで一元管理します。
          </p>
        </header>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">新規申請</h2>
          <p className="text-sm text-zinc-500">
            承認ルートを選択して必要事項を入力すると、自動的に回覧されます。
          </p>
          <div className="mt-4">
            <ApplicationCreateForm routes={routeOptions} />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">申請一覧</h2>
            <p className="text-xs text-zinc-500">
              {applications.length} 件
            </p>
          </div>
          {applications.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-500">
              まだ申請がありません。上のフォームから新しい申請を作成すると、ここに表示されます。
            </p>
          ) : (
            <div className="space-y-5">
              {applications.map((application) => {
                const schema = DEFAULT_APPROVAL_FORM_SCHEMA;
                const canAct =
                  application.status === "PENDING" &&
                  application.currentStep &&
                  application.assignments.some(
                    (assignment) =>
                      assignment.stepOrder === application.currentStep &&
                      assignment.status === "IN_PROGRESS" &&
                      assignment.approverRole === member?.role
                  );
                const currentAssignment = application.assignments.find(
                  (assignment) =>
                    application.currentStep &&
                    assignment.stepOrder === application.currentStep
                );
                return (
                  <article
                    key={application.id}
                    className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-zinc-400">
                          {new Intl.DateTimeFormat("ja-JP", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(application.createdAt)}
                        </p>
                        <h3 className="text-2xl font-semibold text-zinc-900">
                          {application.title}
                        </h3>
                        <p className="text-sm text-zinc-600">
                          承認ルート: {application.template.route?.name ?? "未設定"} /
                          申請者: {application.applicant.displayName}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            application.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700"
                              : application.status === "REJECTED"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-sky-50 text-sky-700"
                          }`}
                        >
                          {STATUS_LABELS[application.status]}
                        </span>
                        {application.status === "PENDING" && currentAssignment ? (
                          <p className="mt-2 text-xs text-zinc-500">
                            現在の承認者: {currentAssignment.approverRole}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 md:grid-cols-2">
                      {schema.items.map((field) => (
                        <div key={field.id}>
                          <p className="text-xs uppercase tracking-wide text-zinc-400">
                            {field.label}
                          </p>
                          {field.type === "file" ? (
                            typeof (application.data as Record<string, unknown>)[
                              field.id
                            ] === "string" &&
                            ((application.data as Record<string, unknown>)[
                              field.id
                            ] as string).length > 0 ? (
                              <a
                                href={
                                  (application.data as Record<string, unknown>)[
                                    field.id
                                  ] as string
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-sky-600 underline"
                              >
                                添付ファイルを開く
                              </a>
                            ) : (
                              <p className="mt-1 text-sm text-zinc-400">—</p>
                            )
                          ) : (
                            <p className="mt-1 text-sm text-zinc-800">
                              {formatValue(
                                (application.data as Record<string, unknown>)[field.id]
                              )}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <div className="space-y-3">
                        <p className="text-xs uppercase tracking-wide text-zinc-400">
                          承認ステップ
                        </p>
                        <ol className="space-y-2">
                          {application.assignments.map((assignment) => (
                            <li
                              key={assignment.id}
                              className={`rounded-2xl border px-3 py-2 text-sm ${
                                assignment.status === "APPROVED"
                                  ? "border-emerald-200 bg-emerald-50"
                                  : assignment.status === "REJECTED"
                                  ? "border-rose-200 bg-rose-50"
                                  : assignment.status === "IN_PROGRESS"
                                  ? "border-sky-200 bg-sky-50"
                                  : "border-zinc-100 bg-zinc-50"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-zinc-800">
                                  STEP {assignment.stepOrder}: {assignment.approverRole}
                                </span>
                                <span className="text-xs text-zinc-500">
                                  {STEP_STATUS_LABELS[assignment.status]}
                                </span>
                              </div>
                              {assignment.assignedTo ? (
                                <p className="text-xs text-zinc-600">
                                  担当: {assignment.assignedTo.displayName}
                                </p>
                              ) : null}
                              {assignment.comment ? (
                                <p className="mt-1 text-xs text-zinc-600">
                                  コメント: {assignment.comment}
                                </p>
                              ) : null}
                              {assignment.actedAt ? (
                                <p className="mt-1 text-[0.65rem] text-zinc-400">
                                  {new Date(assignment.actedAt).toLocaleString("ja-JP", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        {canAct ? (
                          <ApplicationActionButtons applicationId={application.id} />
                        ) : (
                          <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-600">
                            {application.status === "PENDING"
                              ? "現在のステップは他の承認者が担当しています。"
                              : "この申請は完了済みです。"}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
