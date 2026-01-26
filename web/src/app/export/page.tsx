import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ROLE_ADMIN, ROLE_ACCOUNTANT } from "@/lib/roles";
import { AccountingExportButtons } from "@/components/accounting-export-buttons";

export default async function ExportPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "export");

  const [member, group, accountingSetting] = await Promise.all([
    prisma.member.findUnique({
      where: { id: session.memberId },
    }),
    prisma.group.findUnique({
      where: { id: session.groupId },
    }),
    prisma.accountingSetting.findUnique({
      where: { groupId: session.groupId },
    }),
  ]);

  if (!member || !group) {
    redirect("/join");
  }

  const canExport = member.role === ROLE_ADMIN || member.role === ROLE_ACCOUNTANT;
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell flex flex-col gap-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-zinc-500">
            Knot Export
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            {group.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            各モジュールのデータをCSV・PDF形式でエクスポートできます。
          </p>
        </header>

        {canExport ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* イベント出欠表のエクスポート */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                イベント出欠表
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                登録されているイベントと出欠状況をエクスポートします。
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="/api/event-exports/csv"
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  CSVダウンロード
                </a>
                <a
                  href="/api/event-exports/pdf"
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  PDFダウンロード
                </a>
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                全てのイベントと出欠情報が含まれます。
              </p>
            </section>

            {/* 収支計算書のエクスポート */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                収支計算書
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                指定した会計年度の収支計算書をエクスポートします。
              </p>

              {accountingSetting ? (
                <AccountingExportButtons
                  fiscalYearStartMonth={accountingSetting.fiscalYearStartMonth}
                  fiscalYearEndMonth={accountingSetting.fiscalYearEndMonth}
                  currentYear={currentYear}
                />
              ) : (
                <p className="mt-4 text-sm text-zinc-500">
                  会計設定が見つかりません。Knot Accounting で設定を行ってください。
                </p>
              )}
            </section>
          </div>
        ) : (
          <section className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-6 text-sm text-zinc-600">
            Knot Export は管理者・会計係のみが利用できます。権限が必要な場合は団体の管理者に連絡してください。
          </section>
        )}

        {/* 使い方セクション */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            エクスポート機能について
          </h2>
          <div className="mt-4 space-y-3 text-sm text-zinc-600">
            <div>
              <h3 className="font-semibold text-zinc-900">CSV形式</h3>
              <p>
                Microsoft ExcelやGoogleスプレッドシートで開くことができます。
                データの加工や分析に適しています。
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">PDF形式</h3>
              <p>
                印刷や配布に適した形式です。レイアウトが固定されているため、
                どの環境でも同じ表示になります。
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">注意事項</h3>
              <ul className="ml-5 mt-1 list-disc space-y-1">
                <li>エクスポートされるデータは、実行時点の最新データです。</li>
                <li>収支計算書は承認済みの経費のみが対象となります。</li>
                <li>エクスポート機能は管理者・会計係のみが利用できます。</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
