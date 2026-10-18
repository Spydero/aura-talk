import { NextResponse } from "next/server";
import { listMessages } from "@/lib/houses";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const url = new URL(request.url);
  const result = await listMessages(id, user.id, {
    roomId: url.searchParams.get("roomId") ?? undefined,
    withUserId: url.searchParams.get("with") ?? undefined,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ messages: result.messages });
}
