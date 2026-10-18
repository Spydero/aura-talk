import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const user = await requireUser();
  if (user) redirect("/");
  return <AuthScreen />;
}
