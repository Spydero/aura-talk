import { NextResponse } from "next/server";
import { kickMember } from "@/lib/houses";
import { notifyHouse } from "@/lib/realtime";
import { requireUser } from "@/lib/session";
import { kickSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const parsed = kickSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose someone to walk out." }, { status: 400 });
  const result = await kickMember(id, user.id, parsed.data.userId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  await notifyHouse(id);
  return NextResponse.json({ ok: true });
}
