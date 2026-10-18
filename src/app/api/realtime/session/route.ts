import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  return NextResponse.json({ cookie: request.headers.get("cookie") ?? "" });
}
