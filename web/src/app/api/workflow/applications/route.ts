import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled, isModuleEnabled } from "@/lib/modules";
import { assertWriteRequestSecurity } from "@/lib/security";
import {
  validateApprovalFormData,
  DEFAULT_APPROVAL_FORM_SCHEMA,
} from "@/lib/workflow-schema";
import { captureApiException, setApiSentryContext } from "@/lib/sentry";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const enabled = await isModuleEnabled(session.groupId, "approval");
  if (!enabled) {
    return NextResponse.json({ applications: [] });
  }

  const applications = await prisma.approvalApplication.findMany({
    where: { groupId: session.groupId },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          fields: true,
          route: { select: { id: true, name: true } },
        },
      },
      applicant: { select: { id: true, displayName: true } },
      assignments: {
        orderBy: { stepOrder: "asc" },
        include: {
          assignedTo: { select: { id: true, displayName: true } },
        },
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
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureModuleEnabled(session.groupId, "approval");

  let body: {
    routeId?: number;
    title?: string;
    data?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (typeof body.routeId !== "number" || !Number.isInteger(body.routeId)) {
    return NextResponse.json(
      { error: "承認ルートを指定してください。" },
      { status: 400 }
    );
  }
  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json(
      { error: "申請タイトルを入力してください。" },
      { status: 400 }
    );
  }
  if (!body.data) {
    return NextResponse.json(
      { error: "申請データはオブジェクト形式で指定してください。" },
      { status: 400 }
    );
  }

  const route = await prisma.approvalRoute.findFirst({
    where: { id: body.routeId, groupId: session.groupId },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  if (!route) {
    return NextResponse.json(
      { error: "指定された承認ルートが見つかりません。" },
      { status: 400 }
    );
  }
  if (route.steps.length === 0) {
    return NextResponse.json(
      { error: "承認ステップが設定されていません。" },
      { status: 400 }
    );
  }

  const { errors, cleaned } = validateApprovalFormData(
    DEFAULT_APPROVAL_FORM_SCHEMA,
    body.data
  );
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  const template =
    (await prisma.approvalTemplate.findFirst({
      where: {
        groupId: session.groupId,
        routeId: route.id,
        name: "共通申請",
        isActive: true,
      },
    })) ??
    (await prisma.approvalTemplate.create({
      data: {
        groupId: session.groupId,
        name: "共通申請",
        description: "申請テンプレート（共通フォーム）",
        fields: DEFAULT_APPROVAL_FORM_SCHEMA,
        routeId: route.id,
        isActive: true,
      },
    }));

  const firstStepOrder = route.steps[0].stepOrder;

  const routePath = new URL(request.url).pathname;
  const sentryContext = {
    module: "approval",
    action: "approval-application-create",
    route: routePath,
    method: request.method,
    groupId: session.groupId,
    memberId: session.memberId,
    entity: { routeId: route.id, templateId: template.id },
  } as const;
  setApiSentryContext(sentryContext);

  try {
    const application = await prisma.approvalApplication.create({
      data: {
        groupId: session.groupId,
        templateId: template.id,
        applicantId: session.memberId,
        title: body.title.trim(),
        data: cleaned,
        status: "PENDING",
        currentStep: firstStepOrder,
        assignments: {
          create: route.steps.map((step) => ({
            stepId: step.id,
            stepOrder: step.stepOrder,
            approverRole: step.approverRole,
            status: step.stepOrder === firstStepOrder ? "IN_PROGRESS" : "WAITING",
          })),
        },
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            fields: true,
            route: { select: { id: true, name: true } },
          },
        },
        applicant: { select: { id: true, displayName: true } },
        assignments: {
          orderBy: { stepOrder: "asc" },
          include: {
            assignedTo: { select: { id: true, displayName: true } },
          },
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
  } catch (error) {
    captureApiException(error, sentryContext);
    return NextResponse.json(
      { error: "申請の作成に失敗しました。" },
      { status: 500 }
    );
  }
}
