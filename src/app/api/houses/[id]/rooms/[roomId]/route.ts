import { NextResponse } from "next/server";
import { deleteRoom, updateRoom } from "@/lib/houses";
import { notifyHouse } from "@/lib/realtime";
import { requireUser } from "@/lib/session";
import { updateRoomSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; roomId: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id, roomId } = await context.params;
  const parsed = updateRoomSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the room details." }, { status: 400 });
  const result = await updateRoom(id, roomId, user.id, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  await notifyHouse(id);
  return NextResponse.json({ room: result.room });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id, roomId } = await context.params;
  const result = await deleteRoom(id, roomId, user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  await notifyHouse(id);
  return NextResponse.json({ ok: true });
}
