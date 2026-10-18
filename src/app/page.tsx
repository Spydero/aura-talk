import { redirect } from "next/navigation";
import { Hall } from "@/components/hall";
import { listHouses } from "@/lib/houses";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  if (!user) redirect("/sign-in");
  const houses = await listHouses(user.id);
  return <Hall name={user.name} houses={houses} />;
}
