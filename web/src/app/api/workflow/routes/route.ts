import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import { ensureModuleEnabled, isModuleEnabled } from "@/lib/modules";
import { assertWriteRequestSecurity } from "@/lib/security";

import { Prisma } from "@prisma/client";
import { captureApiException, setApiSentryContext } from "@/lib/sentry";

type StepInput = {
  approverRole: string;
  requireAll?: boolean;
  conditions?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

function requireStepsPayload(value: unknown): StepInput[] {
  if (!Array.isArray(value)) {
    throw new Error("steps should be an array");
  }
  const steps = value.map((step, index) => {
    if (typeof step !== "object" || step === null) {
      throw new Error(`Step ${index + 1} is invalid`);
    }
    const candidate = step as Record<string, unknown>;
    if (typeof candidate.approverRole !== "string") {
      throw new Error(`Step ${index + 1} is invalid`);
    }
    return {
      approverRole: candidate.approverRole,
      requireAll:
        typeof candidate.requireAll === "boolean" ? candidate.requireAll : true,
      conditions: candidate.conditions
        ? (candidate.conditions as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    };
  });
  if (steps.length === 0) {
    throw new Error("少なくとも1つの承認ステップが必要です。");
  }
  return steps;
}

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const enabled = await isModuleEnabled(session.groupId, "approval");
  if (!enabled) {
    return NextResponse.json({ routes: [] });
  }

  const routes = await prisma.approvalRoute.findMany({
    where: { groupId: session.groupId },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    routes: routes.map((route) => ({
      ...route,
      createdAt: route.createdAt.toISOString(),
      updatedAt: route.updatedAt.toISOString(),
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
    steps?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "ルート名を入力してください。" },
      { status: 400 }
    );
  }

  let steps: ReturnType<typeof requireStepsPayload>;
  try {
    steps = requireStepsPayload(body.steps);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "steps invalid" },
      { status: 400 }
    );
  }

  const route = new URL(request.url).pathname;
  const sentryContext = {
    module: "approval",
    action: "approval-route-create",
    route,
    method: request.method,
    groupId: session.groupId,
    memberId: session.memberId,
  } as const;
  setApiSentryContext(sentryContext);

  try {
    const created = await prisma.approvalRoute.create({
      data: {
        groupId: session.groupId,
        name: body.name.trim(),
        steps: {
          create: steps.map((step, index) => ({
            stepOrder: index + 1,
            approverRole: step.approverRole,
            requireAll: step.requireAll ?? true,
            conditions: step.conditions,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    });

    return NextResponse.json(
      {
        route: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    captureApiException(error, sentryContext);
    return NextResponse.json(
      { error: "承認ルートの作成に失敗しました。" },
      { status: 500 }
    );
  }
}
