import { NextResponse } from "next/server";
import { createHouse, listHouses } from "@/lib/houses";
import { requireUser } from "@/lib/session";
import { createHouseSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const houses = await listHouses(user.id);
  return NextResponse.json({ houses });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = createHouseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Give the house a name." }, { status: 400 });
  }
  const house = await createHouse(user.id, parsed.data.name, parsed.data.welcome ?? "");
  return NextResponse.json({ house }, { status: 201 });
}
