import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import { ensureModuleEnabled } from "@/lib/modules";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
} from "@/lib/security";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureModuleEnabled(session.groupId, "approval");

  const templates = await prisma.approvalTemplate.findMany({
    where: { groupId: session.groupId },
    include: {
      route: {
        select: {
          id: true,
          name: true,
          steps: { orderBy: { stepOrder: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    templates: templates.map((template) => ({
      ...template,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
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
  });
  if (!member || member.role !== ROLE_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    name?: string;
    description?: string | null;
    fields?: unknown;
    routeId?: number;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "テンプレート名を入力してください。" },
      { status: 400 }
    );
  }
  if (typeof body.routeId !== "number" || !Number.isInteger(body.routeId)) {
    return NextResponse.json(
      { error: "承認ルートを指定してください。" },
      { status: 400 }
    );
  }
  if (
    !body.fields ||
    typeof body.fields !== "object" ||
    Array.isArray(body.fields)
  ) {
    return NextResponse.json(
      { error: "fields はオブジェクト形式で指定してください。" },
      { status: 400 }
    );
  }

  const route = await prisma.approvalRoute.findFirst({
    where: { id: body.routeId, groupId: session.groupId },
  });
  if (!route) {
    return NextResponse.json(
      { error: "指定された承認ルートが見つかりません。" },
      { status: 400 }
    );
  }

  const template = await prisma.approvalTemplate.create({
    data: {
      groupId: session.groupId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      fields: body.fields,
      routeId: route.id,
    },
    include: {
      route: {
        select: {
          id: true,
          name: true,
          steps: { orderBy: { stepOrder: "asc" } },
        },
      },
    },
  });

  return NextResponse.json(
    {
      template: {
        ...template,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
