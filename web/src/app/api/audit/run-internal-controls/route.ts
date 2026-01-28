import { NextRequest, NextResponse } from "next/server";
import { assertWriteRequestSecurity } from "@/lib/security";
import { getAuditViewerForApi } from "@/lib/audit/access";
import { runInternalControlChecks } from "@/lib/audit/internal-controls";

export async function POST(request: NextRequest) {
  const guard = assertWriteRequestSecurity(request);
  if (guard) return guard;

  const context = await getAuditViewerForApi();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runInternalControlChecks(context.session.groupId);

  return NextResponse.json({ results });
}
