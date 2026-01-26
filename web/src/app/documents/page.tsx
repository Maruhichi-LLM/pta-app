import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { isPlatformAdminEmail } from "@/lib/admin";
import { DocumentCategory } from "@prisma/client";
import { DocumentCreateForm } from "@/components/document-create-form";
import { DocumentDeleteButton } from "@/components/document-delete-button";

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  POLICY: "規程・方針",
  REPORT: "報告書",
  FINANCE: "会計関連",
  MEETING_NOTE: "議事録 / メモ",
  OTHER: "その他",
};

type DocumentsPageProps = {
  searchParams?: Promise<{
    fiscalYear?: string;
    category?: string;
  }>;
};

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { email: true, role: true },
  });
  const isAdmin = isPlatformAdminEmail(member?.email ?? null);
  const isGroupAdmin = member?.role === "ADMIN";
  const resolvedParams = (await searchParams) ?? {};
  const fiscalYearParam = Number(resolvedParams.fiscalYear ?? "");
  const categoryParam = resolvedParams.category;
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
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-6 text-sm text-sky-900 shadow-sm">
          Knot Document は団体の規定・規約・議事録・収支計算書など“確定版（最終版）”を保存する場所です。編集途中のファイルではなく、確定した文書を保存してください。
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
                        <div className="flex flex-wrap justify-end gap-2">
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
                          {doc.sourceThreadId ? (
                            <Link
                              href={`/threads/${doc.sourceThreadId}${
                                doc.sourceChatMessageId
                                  ? `?message=${doc.sourceChatMessageId}`
                                  : ""
                              }`}
                              className="rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs font-semibold text-sky-600 hover:border-sky-400"
                            >
                              関連Thread
                            </Link>
                          ) : doc.sourceChatMessageId ? (
                            <Link
                              href={`/chat?message=${doc.sourceChatMessageId}`}
                              className="rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-sky-400"
                            >
                              元チャット
                            </Link>
                          ) : null}
                          {isAdmin || isGroupAdmin ? (
                            <DocumentDeleteButton
                              documentId={doc.id}
                              documentTitle={doc.title}
                            />
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
          <DocumentCreateForm
            isAdmin={isAdmin}
            adminGroups={adminGroups}
            defaultGroupId={session.groupId}
            currentYear={currentYear}
          />
        </section>
      </div>
    </div>
  );
}
