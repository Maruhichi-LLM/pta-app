import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled, isModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { ROLE_ADMIN } from "@/lib/roles";

export default async function ApprovalLandingPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "approval");

  const [member, approvalEnabled] = await Promise.all([
    prisma.member.findUnique({
      where: { id: session.memberId },
      select: { role: true },
    }),
    isModuleEnabled(session.groupId, "approval"),
  ]);

  if (!approvalEnabled) {
    redirect("/home");
  }
  const isAdmin = member?.role === ROLE_ADMIN;

  return (
    <div className="min-h-screen bg-transparent py-12">
      <div className="page-shell space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-zinc-500">
            Knot Approval
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
            申請・承認ワークフロー
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            備品購入や休暇など、団体内の申請をここで一元管理します。
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/approval/templates"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-sky-200 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-zinc-900">申請テンプレート</h2>
            <p className="mt-1 text-sm text-zinc-600">
              頻出する申請の項目や承認ルートをテンプレート化し、申請者に配布します。
            </p>
            <p className="mt-4 text-xs font-semibold text-sky-600">
              テンプレ一覧を見る →
            </p>
          </Link>
          <Link
            href="/approval/applications"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-sky-200 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-zinc-900">申請と承認</h2>
            <p className="mt-1 text-sm text-zinc-600">
              新しい申請の起票や、担当者としての承認／差戻しを行います。
            </p>
            <p className="mt-4 text-xs font-semibold text-sky-600">
              申請一覧を見る →
            </p>
          </Link>
          {isAdmin ? (
            <Link
              href="/approval/routes"
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-sky-200 hover:shadow"
            >
              <h2 className="text-lg font-semibold text-zinc-900">承認ルート</h2>
              <p className="mt-1 text-sm text-zinc-600">
                役割ごとの承認ステップを作成し、テンプレートから使い回せるようにします。
              </p>
              <p className="mt-4 text-xs font-semibold text-sky-600">
                ルートを設定する →
              </p>
            </Link>
          ) : null}
        </div>
        {!isAdmin ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
            承認ルートやテンプレートの追加は管理者のみが実行できます。
          </p>
        ) : null}
      </div>
    </div>
  );
}
