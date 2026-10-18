import type { House, Message, Room, User } from "@prisma/client";
import { prisma } from "./prisma";
import { inviteCode } from "./codes";
import { checkSecret, hashSecret } from "./passwords";
import type { ChatMessage, HouseDetail, HouseSummary, PublicRoom } from "./types";

type RoomRow = Room;

export function publicRoom(room: RoomRow): PublicRoom {
  return {
    id: room.id,
    parentId: room.parentId,
    name: room.name,
    topic: room.topic,
    hasPassword: Boolean(room.passwordHash),
    maxUsers: room.maxUsers,
    sortOrder: room.sortOrder,
  };
}

export function publicMessage(
  message: Message & { author: Pick<User, "name"> },
): ChatMessage {
  return {
    id: message.id,
    roomId: message.roomId,
    authorId: message.authorId,
    authorName: message.author.name,
    recipientId: message.recipientId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

function houseDetail(house: House & { rooms: Room[] }): HouseDetail {
  return {
    id: house.id,
    name: house.name,
    code: house.code,
    welcome: house.welcome,
    hasPassword: Boolean(house.passwordHash),
    ownerId: house.ownerId,
    rooms: [...house.rooms]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(publicRoom),
  };
}

export async function listHouses(userId: string): Promise<HouseSummary[]> {
  const memberships = await prisma.houseMember.findMany({
    where: { userId },
    include: {
      house: {
        include: { _count: { select: { rooms: true, members: true } } },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return memberships.map((membership) => ({
    id: membership.house.id,
    name: membership.house.name,
    code: membership.house.code,
    welcome: membership.house.welcome,
    hasPassword: Boolean(membership.house.passwordHash),
    ownerId: membership.house.ownerId,
    roomCount: membership.house._count.rooms,
    memberCount: membership.house._count.members,
    role: membership.house.ownerId === userId ? "owner" : "member",
  }));
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = inviteCode();
    const existing = await prisma.house.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Could not mint an invite code.");
}

export async function createHouse(userId: string, name: string, welcome = "") {
  const code = await uniqueCode();
  const house = await prisma.house.create({
    data: {
      name,
      welcome,
      code,
      ownerId: userId,
      members: { create: { userId } },
      rooms: {
        create: {
          name: "Lobby",
          topic: "Everyone starts here.",
          sortOrder: 0,
        },
      },
    },
    include: { rooms: true },
  });
  return houseDetail(house);
}

export async function getHouseForMember(houseId: string, userId: string) {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    include: { rooms: true },
  });
  if (!house) return null;
  const member = await prisma.houseMember.findUnique({
    where: { houseId_userId: { houseId, userId } },
  });
  if (!member) return null;
  return houseDetail(house);
}

export async function getHouseByCode(code: string) {
  return prisma.house.findUnique({
    where: { code: code.toUpperCase() },
    include: { rooms: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function joinHouse(userId: string, code: string, password?: string) {
  const house = await getHouseByCode(code);
  if (!house) {
    return { error: "No house uses that code.", status: 404 as const };
  }

  const existing = await prisma.houseMember.findUnique({
    where: { houseId_userId: { houseId: house.id, userId } },
  });

  if (!existing && house.passwordHash) {
    if (!password) {
      return {
        error: "This house has a password.",
        status: 401 as const,
        needsPassword: true,
        name: house.name,
      };
    }
    const matches = await checkSecret(password, house.passwordHash);
    if (!matches) {
      return {
        error: "That password does not open this house.",
        status: 401 as const,
        needsPassword: true,
        name: house.name,
      };
    }
  }

  if (!existing) {
    await prisma.houseMember.create({ data: { houseId: house.id, userId } });
  }

  return { house: houseDetail(house) };
}

export async function updateHouse(
  houseId: string,
  userId: string,
  input: { name?: string; welcome?: string; password?: string | null },
) {
  const house = await prisma.house.findUnique({ where: { id: houseId } });
  if (!house) return { error: "That house is gone.", status: 404 as const };
  if (house.ownerId !== userId) {
    return { error: "Only the host can change the house.", status: 403 as const };
  }

  const data: { name?: string; welcome?: string; passwordHash?: string | null } = {};
  if (input.name) data.name = input.name;
  if (input.welcome !== undefined) data.welcome = input.welcome;
  if (input.password === null) data.passwordHash = null;
  if (typeof input.password === "string") data.passwordHash = await hashSecret(input.password);

  const updated = await prisma.house.update({
    where: { id: houseId },
    data,
    include: { rooms: true },
  });
  return { house: houseDetail(updated) };
}

export async function deleteHouse(houseId: string, userId: string) {
  const house = await prisma.house.findUnique({ where: { id: houseId } });
  if (!house) return { error: "That house is gone.", status: 404 as const };
  if (house.ownerId !== userId) {
    return { error: "Only the host can close the house.", status: 403 as const };
  }
  await prisma.house.delete({ where: { id: houseId } });
  return { ok: true as const };
}

export async function leaveHouse(houseId: string, userId: string) {
  const house = await prisma.house.findUnique({ where: { id: houseId } });
  if (!house) return { error: "That house is gone.", status: 404 as const };
  if (house.ownerId === userId) {
    return { error: "Hosts close the house instead of leaving it.", status: 400 as const };
  }
  await prisma.houseMember.deleteMany({ where: { houseId, userId } });
  return { ok: true as const };
}

export async function kickMember(houseId: string, actorId: string, userId: string) {
  const house = await prisma.house.findUnique({ where: { id: houseId } });
  if (!house) return { error: "That house is gone.", status: 404 as const };
  if (house.ownerId !== actorId) {
    return { error: "Only the host can walk someone out.", status: 403 as const };
  }
  if (userId === actorId) {
    return { error: "You cannot kick yourself.", status: 400 as const };
  }
  await prisma.houseMember.deleteMany({ where: { houseId, userId } });
  return { ok: true as const };
}

function depthOf(rooms: Room[], parentId: string | null) {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  let depth = 1;
  let current = parentId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) return 99;
    seen.add(current);
    depth += 1;
    current = byId.get(current)?.parentId ?? null;
  }
  return depth;
}

function isDescendant(rooms: Room[], roomId: string, parentId: string) {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  let current: string | null = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === roomId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

export async function createRoom(
  houseId: string,
  userId: string,
  input: {
    name: string;
    parentId?: string | null;
    topic?: string;
    maxUsers?: number;
    password?: string | null;
  },
) {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    include: { rooms: true },
  });
  if (!house) return { error: "That house is gone.", status: 404 as const };
  if (house.ownerId !== userId) {
    return { error: "Only the host can add rooms.", status: 403 as const };
  }

  const parentId = input.parentId ?? null;
  if (parentId && !house.rooms.some((room) => room.id === parentId)) {
    return { error: "That parent room is not in this house.", status: 400 as const };
  }
  if (depthOf(house.rooms, parentId) > 3) {
    return { error: "Rooms only nest three levels deep.", status: 400 as const };
  }

  const siblings = house.rooms.filter((room) => room.parentId === parentId);
  const sortOrder = siblings.reduce((max, room) => Math.max(max, room.sortOrder), 0) + 1;
  const room = await prisma.room.create({
    data: {
      houseId,
      parentId,
      name: input.name,
      topic: input.topic ?? "",
      maxUsers: input.maxUsers ?? 16,
      sortOrder,
      passwordHash: input.password ? await hashSecret(input.password) : null,
    },
  });
  return { room: publicRoom(room) };
}

export async function updateRoom(
  houseId: string,
  roomId: string,
  userId: string,
  input: {
    name?: string;
    parentId?: string | null;
    topic?: string;
    maxUsers?: number;
    password?: string | null;
    move?: "up" | "down";
  },
) {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    include: { rooms: true },
  });
  if (!house) return { error: "That house is gone.", status: 404 as const };
  if (house.ownerId !== userId) {
    return { error: "Only the host can change rooms.", status: 403 as const };
  }
  const room = house.rooms.find((item) => item.id === roomId);
  if (!room) return { error: "That room is gone.", status: 404 as const };

  if (input.move) {
    const siblings = house.rooms
      .filter((item) => item.parentId === room.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const index = siblings.findIndex((item) => item.id === room.id);
    const swap = siblings[input.move === "up" ? index - 1 : index + 1];
    if (swap) {
      await prisma.$transaction([
        prisma.room.update({ where: { id: room.id }, data: { sortOrder: swap.sortOrder } }),
        prisma.room.update({ where: { id: swap.id }, data: { sortOrder: room.sortOrder } }),
      ]);
    }
  }

  const data: {
    name?: string;
    topic?: string;
    maxUsers?: number;
    parentId?: string | null;
    passwordHash?: string | null;
  } = {};
  if (input.name) data.name = input.name;
  if (input.topic !== undefined) data.topic = input.topic;
  if (input.maxUsers) data.maxUsers = input.maxUsers;
  if (input.password === null) data.passwordHash = null;
  if (typeof input.password === "string") data.passwordHash = await hashSecret(input.password);

  if (input.parentId !== undefined) {
    if (input.parentId === room.id) {
      return { error: "A room cannot sit inside itself.", status: 400 as const };
    }
    if (input.parentId && !house.rooms.some((item) => item.id === input.parentId)) {
      return { error: "That parent room is not in this house.", status: 400 as const };
    }
    if (input.parentId && isDescendant(house.rooms, room.id, input.parentId)) {
      return { error: "That would loop the floor plan.", status: 400 as const };
    }
    if (depthOf(house.rooms, input.parentId ?? null) > 3) {
      return { error: "Rooms only nest three levels deep.", status: 400 as const };
    }
    data.parentId = input.parentId;
  }

  const updated = await prisma.room.update({ where: { id: room.id }, data });
  return { room: publicRoom(updated) };
}

export async function deleteRoom(houseId: string, roomId: string, userId: string) {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    include: { rooms: true },
  });
  if (!house) return { error: "That house is gone.", status: 404 as const };
  if (house.ownerId !== userId) {
    return { error: "Only the host can remove rooms.", status: 403 as const };
  }
  const room = house.rooms.find((item) => item.id === roomId);
  if (!room) return { error: "That room is gone.", status: 404 as const };
  if (house.rooms.length <= 1) {
    return { error: "A house needs at least one room.", status: 400 as const };
  }
  if (house.rooms.some((item) => item.parentId === room.id)) {
    return { error: "Move or remove the rooms inside this one first.", status: 400 as const };
  }
  await prisma.room.delete({ where: { id: room.id } });
  return { ok: true as const };
}

export async function listMessages(
  houseId: string,
  userId: string,
  filter: { roomId?: string; withUserId?: string },
) {
  const member = await prisma.houseMember.findUnique({
    where: { houseId_userId: { houseId, userId } },
  });
  if (!member) return { error: "You are not in this house.", status: 403 as const };

  if (filter.withUserId) {
    const rows = await prisma.message.findMany({
      where: {
        houseId,
        OR: [
          { authorId: userId, recipientId: filter.withUserId },
          { authorId: filter.withUserId, recipientId: userId },
        ],
      },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    return { messages: rows.reverse().map(publicMessage) };
  }

  if (!filter.roomId) return { messages: [] as ChatMessage[] };

  const rows = await prisma.message.findMany({
    where: { houseId, roomId: filter.roomId, recipientId: null },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return { messages: rows.reverse().map(publicMessage) };
}
