import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
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

  const applications = await prisma.approvalApplication.findMany({
    where: { groupId: session.groupId },
    include: {
      template: { select: { id: true, name: true } },
      applicant: { select: { id: true, displayName: true } },
      assignments: {
        orderBy: { stepOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    applications: applications.map((app) => ({
      ...app,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
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

  let body: {
    templateId?: number;
    title?: string;
    data?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (
    typeof body.templateId !== "number" ||
    !Number.isInteger(body.templateId)
  ) {
    return NextResponse.json(
      { error: "テンプレートを指定してください。" },
      { status: 400 }
    );
  }
  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json(
      { error: "申請タイトルを入力してください。" },
      { status: 400 }
    );
  }
  if (
    !body.data ||
    typeof body.data !== "object" ||
    Array.isArray(body.data)
  ) {
    return NextResponse.json(
      { error: "申請データはオブジェクト形式で指定してください。" },
      { status: 400 }
    );
  }

  const template = await prisma.approvalTemplate.findFirst({
    where: { id: body.templateId, groupId: session.groupId, isActive: true },
    include: {
      route: {
        include: { steps: { orderBy: { stepOrder: "asc" } } },
      },
    },
  });
  if (!template || !template.route) {
    return NextResponse.json(
      { error: "指定されたテンプレートが見つかりません。" },
      { status: 400 }
    );
  }
  if (template.route.steps.length === 0) {
    return NextResponse.json(
      { error: "承認ステップが設定されていません。" },
      { status: 400 }
    );
  }

  const application = await prisma.approvalApplication.create({
    data: {
      groupId: session.groupId,
      templateId: template.id,
      applicantId: session.memberId,
      title: body.title.trim(),
      data: body.data,
      status: "PENDING",
      currentStep: template.route.steps[0].stepOrder,
      assignments: {
        create: template.route.steps.map((step) => ({
          stepId: step.id,
          stepOrder: step.stepOrder,
          approverRole: step.approverRole,
        })),
      },
    },
    include: {
      template: { select: { id: true, name: true } },
      applicant: { select: { id: true, displayName: true } },
      assignments: {
        orderBy: { stepOrder: "asc" },
      },
    },
  });

  return NextResponse.json(
    {
      application: {
        ...application,
        createdAt: application.createdAt.toISOString(),
        updatedAt: application.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
