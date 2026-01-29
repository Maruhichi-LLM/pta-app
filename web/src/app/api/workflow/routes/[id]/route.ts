import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ROLE_ADMIN } from "@/lib/roles";
import { assertSameOrigin, CSRF_ERROR_MESSAGE } from "@/lib/security";

function parseRouteId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: CSRF_ERROR_MESSAGE },
      { status: 403 }
    );
  }

  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureModuleEnabled(session.groupId, "approval");

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { role: true },
  });
  if (!member || member.role !== ROLE_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: paramId } = await params;
  const routeId = parseRouteId(paramId);
  if (!routeId) {
    return NextResponse.json({ error: "Invalid route id" }, { status: 400 });
  }

  const route = await prisma.approvalRoute.findFirst({
    where: { id: routeId, groupId: session.groupId },
    include: { _count: { select: { templates: true } } },
  });
  if (!route) {
    return NextResponse.json({ error: "対象が見つかりません。" }, { status: 404 });
  }
  if (route._count.templates > 0) {
    return NextResponse.json(
      { error: "この承認ルートはテンプレートで使用中のため削除できません。" },
      { status: 400 }
    );
  }

  await prisma.approvalRoute.delete({
    where: { id: route.id },
  });

  return NextResponse.json({ success: true });
}
