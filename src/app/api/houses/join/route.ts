import { NextResponse } from "next/server";
import { joinHouse } from "@/lib/houses";
import { requireUser } from "@/lib/session";
import { joinHouseSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = joinHouseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the house code." }, { status: 400 });
  }
  const result = await joinHouse(user.id, parsed.data.code, parsed.data.password);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, needsPassword: "needsPassword" in result, name: "name" in result ? result.name : undefined },
      { status: result.status },
    );
  }
  return NextResponse.json({ house: result.house });
}
