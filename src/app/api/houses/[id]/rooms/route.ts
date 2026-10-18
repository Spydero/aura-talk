import { NextResponse } from "next/server";
import { createRoom } from "@/lib/houses";
import { notifyHouse } from "@/lib/realtime";
import { requireUser } from "@/lib/session";
import { createRoomSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const parsed = createRoomSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the room a name." }, { status: 400 });
  const result = await createRoom(id, user.id, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  await notifyHouse(id);
  return NextResponse.json({ room: result.room }, { status: 201 });
}
