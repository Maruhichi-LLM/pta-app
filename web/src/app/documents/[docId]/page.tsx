import Link from "next/link";
import { redirect, notFound } from "next/navigation";
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

type DocumentDetailProps = {
  params: { docId: string };
};

export default async function DocumentDetailPage({ params }: DocumentDetailProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  const docId = Number(params.docId);
  if (!Number.isInteger(docId)) {
    notFound();
  }
  const document = await prisma.document.findUnique({
    where: { id: docId },
    include: {
      group: { select: { id: true, name: true } },
      event: { select: { id: true, title: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          createdBy: { select: { id: true, displayName: true } },
        },
      },
      createdBy: { select: { id: true, displayName: true } },
    },
  });
  if (!document) {
    notFound();
  }
  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { email: true },
  });
  const isAdmin = isPlatformAdminEmail(member?.email ?? null);
  if (!isAdmin && document.groupId !== session.groupId) {
    redirect("/home");
  }

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <div className="flex flex-col gap-2">
          <Link
            href="/documents"
            className="text-sm text-sky-600 underline"
          >
            ← Documents一覧に戻る
          </Link>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Knot Documents
            </p>
            <h1 className="text-3xl font-semibold text-zinc-900">
              {document.title}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-zinc-600">
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
              {CATEGORY_LABELS[document.category]}
            </span>
            <span>{document.fiscalYear}年度</span>
            <span>団体: {document.group.name}</span>
            {document.event ? (
              <span>関連イベント: {document.event.title}</span>
            ) : null}
          </div>
        </div>

        <section className="rounded-2xl border border-white bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">版の履歴</h2>
          {document.versions.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              まだファイルが登録されていません。
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {document.versions.map((version) => (
                <li
                  key={version.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        v{version.versionNumber}・{version.originalFilename}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {version.createdAt.toLocaleString("ja-JP", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}{" "}
                        / {version.createdBy.displayName}
                      </p>
                    </div>
                    <Link
                      href={`/api/documents/${document.id}?download=${version.id}`}
                      className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                    >
                      ダウンロード
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-white bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            新しい版をアップロード
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            既存ファイルは上書きされません。版が追加され履歴が残ります。
          </p>
          <form
            action={`/api/documents/${document.id}`}
            method="post"
            encType="multipart/form-data"
            className="mt-4 space-y-3"
          >
            <label className="block text-sm text-zinc-600">
              ファイル（20MBまで）
              <input
                type="file"
                name="file"
                className="mt-1 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2"
                required
              />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                版を追加する
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
