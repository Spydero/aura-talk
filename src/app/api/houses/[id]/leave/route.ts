import { NextResponse } from "next/server";
import { leaveHouse } from "@/lib/houses";
import { notifyHouse } from "@/lib/realtime";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const result = await leaveHouse(id, user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  await notifyHouse(id);
  return NextResponse.json({ ok: true });
}
