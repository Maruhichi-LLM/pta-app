import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import { ensureModuleEnabled, isModuleEnabled } from "@/lib/modules";
import { assertWriteRequestSecurity } from "@/lib/security";
import { parseApprovalFormSchema } from "@/lib/approval-schema";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const enabled = await isModuleEnabled(session.groupId, "approval");
  if (!enabled) {
    return NextResponse.json({ templates: [] });
  }

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
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
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
  let fieldsSchema;
  try {
    fieldsSchema = parseApprovalFormSchema(body.fields);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fields が不正です" },
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
      fields: fieldsSchema,
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
