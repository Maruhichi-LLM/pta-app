import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { isPlatformAdminEmail } from "@/lib/admin";
import { DocumentCategory } from "@prisma/client";

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  POLICY: "規程・方針",
  REPORT: "報告書",
  FINANCE: "会計関連",
  OTHER: "その他",
};

type DocumentsPageProps = {
  searchParams?: {
    fiscalYear?: string;
    category?: string;
  };
};

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { email: true },
  });
  const isAdmin = isPlatformAdminEmail(member?.email ?? null);
  const fiscalYearParam = Number(searchParams?.fiscalYear ?? "");
  const categoryParam = searchParams?.category;
  const where: Record<string, unknown> = {};
  if (!isAdmin) {
    where.groupId = session.groupId;
  }
  if (!Number.isNaN(fiscalYearParam) && fiscalYearParam > 0) {
    where.fiscalYear = fiscalYearParam;
  }
  const categoryKeys = Object.keys(
    CATEGORY_LABELS
  ) as Array<keyof typeof CATEGORY_LABELS>;
  if (categoryParam && categoryKeys.includes(categoryParam as DocumentCategory)) {
    where.category = categoryParam;
  }

  const documents = await prisma.document.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      group: { select: { id: true, name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          createdAt: true,
          originalFilename: true,
        },
      },
    },
  });

  const adminGroups = isAdmin
    ? await prisma.group.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-zinc-50 py-10">
      <div className="page-shell space-y-8">
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-6 text-sm text-sky-900 shadow-sm">
          Knot Document は団体の“確定版（最終版）”を保存する場所です。編集途中のファイルではなく、確定した文書を保存してください。
        </section>

        <section className="rounded-2xl border border-white bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Knot Documents
              </p>
              <h1 className="text-3xl font-semibold text-zinc-900">Documents</h1>
            </div>
            <form className="flex flex-wrap gap-3 text-sm" action="/documents" method="get">
              <select
                name="fiscalYear"
                defaultValue={
                  !Number.isNaN(fiscalYearParam) && fiscalYearParam > 0
                    ? String(fiscalYearParam)
                    : ""
                }
                className="rounded-full border border-zinc-200 px-3 py-1.5"
              >
                <option value="">年度（すべて）</option>
                {[currentYear, currentYear - 1, currentYear - 2].map((year) => (
                  <option key={year} value={year}>
                    {year}年度
                  </option>
                ))}
              </select>
              <select
                name="category"
                defaultValue={categoryParam ?? ""}
                className="rounded-full border border-zinc-200 px-3 py-1.5"
              >
                <option value="">種別（すべて）</option>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-full bg-zinc-900 px-4 py-1.5 text-white"
              >
                絞り込む
              </button>
            </form>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-100 text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">タイトル</th>
                  {isAdmin ? (
                    <th className="px-4 py-3 text-left">団体</th>
                  ) : null}
                  <th className="px-4 py-3 text-left">種別</th>
                  <th className="px-4 py-3 text-left">年度</th>
                  <th className="px-4 py-3 text-left">更新</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {documents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 6 : 5}
                      className="px-4 py-6 text-center text-sm text-zinc-500"
                    >
                      文書がまだありません。下のフォームからアップロードしてください。
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="px-4 py-3 font-semibold">{doc.title}</td>
                      {isAdmin ? (
                        <td className="px-4 py-3 text-sm text-zinc-500">
                          {doc.group.name}
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                          {CATEGORY_LABELS[doc.category]}
                        </span>
                      </td>
                      <td className="px-4 py-3">{doc.fiscalYear}年度</td>
                      <td className="px-4 py-3 text-sm text-zinc-500">
                        {doc.updatedAt.toLocaleString("ja-JP", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700 hover:border-sky-500 hover:text-sky-600"
                          >
                            詳細
                          </Link>
                          {doc.versions[0] ? (
                            <Link
                              href={`/api/documents/${doc.id}?download=latest`}
                              className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                            >
                              最新版DL
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            新しい文書を保存
          </h2>
          <form
            action="/api/documents"
            method="post"
            encType="multipart/form-data"
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            {isAdmin ? (
              <label className="text-sm text-zinc-600">
                団体
                <select
                  name="groupId"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {adminGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="groupId" value={session.groupId} />
            )}
            <label className="text-sm text-zinc-600">
              タイトル
              <input
                name="title"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                required
              />
            </label>
            <label className="text-sm text-zinc-600">
              種別
              <select
                name="category"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-zinc-600">
              年度
              <input
                type="number"
                name="fiscalYear"
                defaultValue={currentYear}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                required
              />
            </label>
            <label className="text-sm text-zinc-600">
              関連イベントID（任意）
              <input
                type="number"
                name="eventId"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <label className="text-sm text-zinc-600 md:col-span-2">
              ファイル（20MBまで）
              <input
                type="file"
                name="file"
                className="mt-1 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2"
                required
              />
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                アップロード
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
