import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { assertWriteRequestSecurity } from "@/lib/security";
import { captureApiException, setApiSentryContext } from "@/lib/sentry";

type ActionPayload = {
  action?: "approve" | "reject";
  comment?: string;
};

function parseApplicationId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureModuleEnabled(session.groupId, "approval");

  const { id: paramId } = await params;
  const applicationId = parseApplicationId(paramId);
  if (!applicationId) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  let body: ActionPayload = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json(
      { error: "実行するアクションを指定してください。" },
      { status: 400 }
    );
  }
  const comment =
    typeof body.comment === "string" && body.comment.trim().length > 0
      ? body.comment.trim()
      : null;

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { role: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const application = await prisma.approvalApplication.findFirst({
    where: { id: applicationId, groupId: session.groupId },
    include: {
      template: { select: { id: true, name: true, fields: true } },
      applicant: { select: { id: true, displayName: true } },
      assignments: {
        orderBy: { stepOrder: "asc" },
        include: {
          assignedTo: { select: { id: true, displayName: true } },
        },
      },
    },
  });
  if (!application) {
    return NextResponse.json(
      { error: "対象の申請が見つかりません。" },
      { status: 404 }
    );
  }
  if (application.status !== "PENDING" || !application.currentStep) {
    return NextResponse.json(
      { error: "この申請は処理できません。" },
      { status: 400 }
    );
  }

  const currentAssignment = application.assignments.find(
    (assignment) => assignment.stepOrder === application.currentStep
  );
  if (!currentAssignment) {
    return NextResponse.json(
      { error: "承認ステップが見つかりません。" },
      { status: 400 }
    );
  }
  if (currentAssignment.status !== "IN_PROGRESS") {
    return NextResponse.json(
      { error: "このステップは操作できません。" },
      { status: 400 }
    );
  }
  if (member.role !== currentAssignment.approverRole) {
    return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
  }

  const actionStatus = body.action === "approve" ? "APPROVED" : "REJECTED";

  const routePath = new URL(request.url).pathname;
  const sentryContext = {
    module: "approval",
    action:
      body.action === "approve"
        ? "approval-application-approve"
        : "approval-application-reject",
    route: routePath,
    method: request.method,
    groupId: session.groupId,
    memberId: session.memberId,
    entity: { applicationId: application.id },
  } as const;
  setApiSentryContext(sentryContext);

  try {
    const updatedApplication = await prisma.$transaction(async (tx) => {
      await tx.approvalAssignment.update({
        where: { id: currentAssignment.id },
        data: {
          status: actionStatus,
          actedAt: new Date(),
          comment,
          assignedToId: session.memberId,
        },
      });

      if (body.action === "approve") {
        const nextAssignment = application.assignments.find(
          (assignment) => assignment.stepOrder > currentAssignment.stepOrder
        );
        if (nextAssignment) {
          await tx.approvalAssignment.update({
            where: { id: nextAssignment.id },
            data: { status: "IN_PROGRESS" },
          });
          return tx.approvalApplication.update({
            where: { id: application.id },
            data: {
              currentStep: nextAssignment.stepOrder,
              status: "PENDING",
            },
            include: {
              template: { select: { id: true, name: true, fields: true } },
              applicant: { select: { id: true, displayName: true } },
              assignments: {
                orderBy: { stepOrder: "asc" },
                include: {
                  assignedTo: { select: { id: true, displayName: true } },
                },
              },
            },
          });
        }
        return tx.approvalApplication.update({
          where: { id: application.id },
          data: {
            currentStep: null,
            status: "APPROVED",
          },
          include: {
            template: { select: { id: true, name: true, fields: true } },
            applicant: { select: { id: true, displayName: true } },
            assignments: {
              orderBy: { stepOrder: "asc" },
              include: {
                assignedTo: { select: { id: true, displayName: true } },
              },
            },
          },
        });
      }

      await tx.approvalAssignment.updateMany({
        where: {
          applicationId: application.id,
          stepOrder: { gt: currentAssignment.stepOrder },
        },
        data: {
          status: "WAITING",
          assignedToId: null,
          actedAt: null,
          comment: null,
        },
      });

      return tx.approvalApplication.update({
        where: { id: application.id },
        data: {
          currentStep: null,
          status: "REJECTED",
        },
        include: {
          template: { select: { id: true, name: true, fields: true } },
          applicant: { select: { id: true, displayName: true } },
          assignments: {
            orderBy: { stepOrder: "asc" },
            include: {
              assignedTo: { select: { id: true, displayName: true } },
            },
          },
        },
      });
    });

    return NextResponse.json({
      application: {
        ...updatedApplication,
        createdAt: updatedApplication.createdAt.toISOString(),
        updatedAt: updatedApplication.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    captureApiException(error, sentryContext, {
      action: body.action,
    });
    return NextResponse.json(
      { error: "承認処理に失敗しました。" },
      { status: 500 }
    );
  }
}
