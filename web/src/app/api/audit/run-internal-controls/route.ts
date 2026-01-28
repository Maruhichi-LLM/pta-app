import { NextRequest, NextResponse } from "next/server";
import { assertWriteRequestSecurity } from "@/lib/security";
import { getAuditViewerForApi } from "@/lib/audit/access";
import { runInternalControlChecks } from "@/lib/audit/internal-controls";
import { captureApiException, setApiSentryContext } from "@/lib/sentry";

export async function POST(request: NextRequest) {
  const guard = assertWriteRequestSecurity(request);
  if (guard) return guard;

  const context = await getAuditViewerForApi();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const routePath = new URL(request.url).pathname;
  const sentryContext = {
    module: "audit",
    action: "audit-run-internal-controls",
    route: routePath,
    method: request.method,
    groupId: context.session.groupId,
    memberId: context.member.id,
  } as const;
  setApiSentryContext(sentryContext);

  try {
    const results = await runInternalControlChecks(context.session.groupId);

    return NextResponse.json({ results });
  } catch (error) {
    captureApiException(error, sentryContext);
    return NextResponse.json(
      { error: "監査チェックの実行に失敗しました。" },
      { status: 500 }
    );
  }
}
