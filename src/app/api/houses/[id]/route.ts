import { NextResponse } from "next/server";
import { deleteHouse, getHouseForMember, updateHouse } from "@/lib/houses";
import { notifyHouse } from "@/lib/realtime";
import { requireUser } from "@/lib/session";
import { updateHouseSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const house = await getHouseForMember(id, user.id);
  if (!house) return NextResponse.json({ error: "That house is not yours to open." }, { status: 404 });
  return NextResponse.json({ house });
}

export async function PATCH(request: Request, context: Context) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateHouseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the house details." }, { status: 400 });
  }
  const result = await updateHouse(id, user.id, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  await notifyHouse(id);
  return NextResponse.json({ house: result.house });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const result = await deleteHouse(id, user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  await notifyHouse(id);
  return NextResponse.json({ ok: true });
}
