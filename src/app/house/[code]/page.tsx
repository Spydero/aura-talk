import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { HouseClient } from "@/components/house/house-client";
import { JoinGate } from "@/components/join-gate";
import { getHouseByCode, getHouseForMember } from "@/lib/houses";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return { title: code.toUpperCase() };
}

export default async function HousePage({ params }: Props) {
  const user = await requireUser();
  if (!user) redirect("/sign-in");
  const { code } = await params;
  const found = await getHouseByCode(code);
  if (!found) notFound();

  const member = await prisma.houseMember.findUnique({
    where: { houseId_userId: { houseId: found.id, userId: user.id } },
  });
  if (!member) {
    return <JoinGate code={found.code} name={found.name} hasPassword={Boolean(found.passwordHash)} />;
  }

  const house = await getHouseForMember(found.id, user.id);
  if (!house) notFound();
  return <HouseClient house={house} selfId={user.id} />;
}
