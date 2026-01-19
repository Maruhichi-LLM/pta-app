import { getSessionFromCookies } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const session = await getSessionFromCookies();
  redirect(session ? "/home" : "/login");
}
