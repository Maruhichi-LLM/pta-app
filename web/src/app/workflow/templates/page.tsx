import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";

export default async function ApprovalTemplatesPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "approval");
  redirect("/workflow/applications");
}
