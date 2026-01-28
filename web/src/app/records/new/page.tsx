import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { isPlatformAdminEmail } from "@/lib/admin";
import { RecordCreateForm } from "@/components/record-create-form";

type RecordCreatePageProps = {
  searchParams?: Promise<{
    eventId?: string;
    sourceType?: string;
    sourceId?: string;
    caption?: string;
  }>;
};

export default async function RecordCreatePage({ searchParams }: RecordCreatePageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "record");

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { email: true },
  });
  const isAdmin = isPlatformAdminEmail(member?.email ?? null);

  const resolvedParams = (await searchParams) ?? {};
  const eventIdParam = Number(resolvedParams.eventId ?? "");
  const sourceIdParam = Number(resolvedParams.sourceId ?? "");
  const sourceTypeParam = resolvedParams.sourceType?.toUpperCase();
  const captionParam = resolvedParams.caption;

  const [events, adminGroups] = await Promise.all([
    prisma.event.findMany({
      where: { groupId: session.groupId },
      orderBy: { startsAt: "desc" },
      select: { id: true, title: true },
    }),
    isAdmin
      ? prisma.group.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-6">
        <Link href="/records" className="text-sm text-sky-600 underline">
          ← Records一覧に戻る
        </Link>

        <section className="rounded-2xl border border-white bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Knot Records
            </p>
            <h1 className="text-3xl font-semibold text-zinc-900">新規記録</h1>
            <p className="mt-2 text-sm text-zinc-500">
              活動の写真をアップロードし、最低限の文脈だけを残します。
            </p>
          </div>

          <RecordCreateForm
            isAdmin={isAdmin}
            adminGroups={adminGroups}
            defaultGroupId={session.groupId}
            events={events}
            defaultEventId={
              Number.isInteger(eventIdParam) ? eventIdParam : undefined
            }
            defaultSourceType={
              sourceTypeParam === "CHAT" ||
              sourceTypeParam === "TODO" ||
              sourceTypeParam === "EVENT"
                ? sourceTypeParam
                : undefined
            }
            defaultSourceId={
              Number.isInteger(sourceIdParam) ? sourceIdParam : undefined
            }
            defaultCaption={captionParam ?? undefined}
          />
        </section>
      </div>
    </div>
  );
}
