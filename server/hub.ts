import type { WebSocket } from "ws";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";
import { checkSecret } from "../src/lib/passwords";
import { publicMessage, publicRoom } from "../src/lib/houses";
import type { ChatMessage, PresenceMember, ServerEvent, SignalData } from "../src/lib/types";

type Member = {
  socket: WebSocket;
  userId: string;
  name: string;
  houseId: string | null;
  roomId: string | null;
  away: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  lastChatAt: number;
};

type ClientMessage = {
  type?: string;
  cookie?: string;
  houseId?: string;
  roomId?: string;
  password?: string;
  body?: string;
  toUserId?: string;
  away?: boolean;
  muted?: boolean;
  deafened?: boolean;
  speaking?: boolean;
  data?: SignalData;
};

function send(socket: WebSocket, event: ServerEvent) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

export class Hub {
  private bySocket = new Map<WebSocket, Member>();
  private byUser = new Map<string, Member>();

  attach(socket: WebSocket) {
    let chain = Promise.resolve();
    const failTimer = setTimeout(() => {
      if (!this.bySocket.has(socket)) socket.close(4001, "hello timeout");
    }, 8000);

    socket.on("message", (raw) => {
      chain = chain
        .then(async () => {
          const text = typeof raw === "string" ? raw : raw.toString();
          if (text.length > 50_000) return;
          let message: ClientMessage;
          try {
            message = JSON.parse(text) as ClientMessage;
          } catch {
            return;
          }
          await this.handle(socket, message);
          if (this.bySocket.has(socket)) clearTimeout(failTimer);
        })
        .catch((error) => {
          console.error("realtime handler", error);
          send(socket, {
            type: "error",
            code: "server",
            message: "The house hiccuped. Try that again.",
          });
        });
    });

    socket.on("close", () => {
      clearTimeout(failTimer);
      this.disconnect(socket);
    });
  }

  private async handle(socket: WebSocket, message: ClientMessage) {
    if (message.type === "ping") return;
    const member = this.bySocket.get(socket);

    if (message.type === "hello") {
      await this.hello(socket, message.cookie ?? "");
      return;
    }
    if (!member) {
      send(socket, { type: "error", code: "unauthorized", message: "Say hello first." });
      return;
    }
    if (message.type === "join" && message.houseId) {
      await this.joinHouse(member, message.houseId);
      return;
    }
    if (message.type === "enter" && message.roomId) {
      await this.enterRoom(member, message.roomId, message.password);
      return;
    }
    if (message.type === "status") {
      this.updateStatus(member, message);
      return;
    }
    if (message.type === "chat" && message.roomId && message.body) {
      await this.chat(member, message.roomId, message.body);
      return;
    }
    if (message.type === "dm" && message.toUserId && message.body) {
      await this.dm(member, message.toUserId, message.body);
      return;
    }
    if (message.type === "signal" && message.toUserId && message.data) {
      this.signal(member, message.toUserId, message.data);
    }
  }

  private async hello(socket: WebSocket, cookie: string) {
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    if (!session) {
      send(socket, { type: "error", code: "unauthorized", message: "Sign in first." });
      socket.close(4003, "unauthorized");
      return;
    }

    const previous = this.byUser.get(session.user.id);
    if (previous && previous.socket !== socket) {
      previous.socket.close(4000, "replaced");
      this.bySocket.delete(previous.socket);
    }

    const member: Member = {
      socket,
      userId: session.user.id,
      name: session.user.name,
      houseId: null,
      roomId: null,
      away: false,
      muted: false,
      deafened: false,
      speaking: false,
      lastChatAt: 0,
    };
    this.bySocket.set(socket, member);
    this.byUser.set(session.user.id, member);
    if (previous?.houseId) this.broadcastPresence(previous.houseId);
    send(socket, { type: "hello", user: { id: session.user.id, name: session.user.name } });
  }

  private disconnect(socket: WebSocket) {
    const member = this.bySocket.get(socket);
    if (!member) return;
    this.bySocket.delete(socket);
    if (this.byUser.get(member.userId)?.socket === socket) {
      this.byUser.delete(member.userId);
    }
    if (member.houseId) this.broadcastPresence(member.houseId);
  }

  private inHouse(houseId: string) {
    return [...this.byUser.values()].filter((member) => member.houseId === houseId);
  }

  private presence(houseId: string): PresenceMember[] {
    return this.inHouse(houseId).map((member) => ({
      userId: member.userId,
      name: member.name,
      roomId: member.roomId,
      away: member.away,
      muted: member.muted,
      deafened: member.deafened,
      speaking: member.speaking && !member.muted && !member.deafened,
    }));
  }

  private broadcast(houseId: string, event: ServerEvent) {
    for (const member of this.inHouse(houseId)) send(member.socket, event);
  }

  private broadcastPresence(houseId: string) {
    this.broadcast(houseId, { type: "presence", members: this.presence(houseId) });
  }

  private async lobbyId(houseId: string) {
    const room = await prisma.room.findFirst({
      where: { houseId, parentId: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return room?.id ?? null;
  }

  private async joinHouse(member: Member, houseId: string) {
    const membership = await prisma.houseMember.findUnique({
      where: { houseId_userId: { houseId, userId: member.userId } },
    });
    if (!membership) {
      send(member.socket, {
        type: "error",
        code: "not-member",
        message: "You are not in this house.",
      });
      return;
    }

    const previous = member.houseId;
    member.houseId = houseId;
    member.roomId = await this.lobbyId(houseId);
    member.speaking = false;
    if (previous && previous !== houseId) this.broadcastPresence(previous);
    send(member.socket, { type: "joined", houseId, roomId: member.roomId });
    await this.refresh(houseId);
  }

  private async enterRoom(member: Member, roomId: string, password?: string) {
    if (!member.houseId) return;
    const room = await prisma.room.findFirst({
      where: { id: roomId, houseId: member.houseId },
    });
    if (!room) {
      send(member.socket, { type: "error", code: "not-found", message: "That room is gone." });
      return;
    }

    const occupants = this.inHouse(member.houseId).filter(
      (person) => person.roomId === room.id && person.userId !== member.userId,
    );
    if (occupants.length >= room.maxUsers) {
      send(member.socket, {
        type: "error",
        code: "room-full",
        message: `${room.name} is full.`,
        roomId: room.id,
      });
      return;
    }

    if (room.passwordHash) {
      const house = await prisma.house.findUnique({ where: { id: member.houseId } });
      const isOwner = house?.ownerId === member.userId;
      if (!isOwner) {
        if (!password) {
          send(member.socket, {
            type: "error",
            code: "room-password",
            message: `${room.name} asks for a password.`,
            roomId: room.id,
          });
          return;
        }
        const matches = await checkSecret(password, room.passwordHash);
        if (!matches) {
          send(member.socket, {
            type: "error",
            code: "wrong-password",
            message: "That password does not open this room.",
            roomId: room.id,
          });
          return;
        }
      }
    }

    member.roomId = room.id;
    member.speaking = false;
    send(member.socket, { type: "entered", roomId: room.id });
    this.broadcastPresence(member.houseId);
  }

  private updateStatus(member: Member, message: ClientMessage) {
    if (!member.houseId) return;
    if (typeof message.away === "boolean") member.away = message.away;
    if (typeof message.muted === "boolean") member.muted = message.muted;
    if (typeof message.deafened === "boolean") member.deafened = message.deafened;
    if (typeof message.speaking === "boolean") member.speaking = message.speaking;
    this.broadcastPresence(member.houseId);
  }

  private cleanBody(body: string) {
    return body.replace(/\s+/g, " ").trim().slice(0, 1000);
  }

  private async chat(member: Member, roomId: string, raw: string) {
    if (!member.houseId || member.roomId !== roomId) {
      send(member.socket, {
        type: "error",
        code: "wrong-room",
        message: "Step into that room before talking there.",
      });
      return;
    }
    const body = this.cleanBody(raw);
    if (!body) return;
    const now = Date.now();
    if (now - member.lastChatAt < 250) return;
    member.lastChatAt = now;

    const row = await prisma.message.create({
      data: {
        houseId: member.houseId,
        roomId,
        authorId: member.userId,
        body,
      },
      include: { author: { select: { name: true } } },
    });
    const message: ChatMessage = publicMessage(row);
    for (const person of this.inHouse(member.houseId)) {
      if (person.roomId === roomId) send(person.socket, { type: "chat", message });
    }
  }

  private async dm(member: Member, toUserId: string, raw: string) {
    if (!member.houseId) return;
    if (toUserId === member.userId) return;
    const body = this.cleanBody(raw);
    if (!body) return;
    const recipient = await prisma.houseMember.findUnique({
      where: { houseId_userId: { houseId: member.houseId, userId: toUserId } },
    });
    if (!recipient) {
      send(member.socket, {
        type: "error",
        code: "not-found",
        message: "That person is not in the house.",
      });
      return;
    }
    const now = Date.now();
    if (now - member.lastChatAt < 250) return;
    member.lastChatAt = now;

    const row = await prisma.message.create({
      data: {
        houseId: member.houseId,
        authorId: member.userId,
        recipientId: toUserId,
        body,
      },
      include: { author: { select: { name: true } } },
    });
    const message = publicMessage(row);
    send(member.socket, { type: "chat", message });
    const target = this.byUser.get(toUserId);
    if (target?.houseId === member.houseId) send(target.socket, { type: "chat", message });
  }

  private signal(member: Member, toUserId: string, data: SignalData) {
    if (!member.houseId || !member.roomId) return;
    const target = this.byUser.get(toUserId);
    if (!target || target.houseId !== member.houseId || target.roomId !== member.roomId) return;
    send(target.socket, { type: "signal", fromUserId: member.userId, data });
  }

  async refresh(houseId: string) {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      include: { rooms: true, members: { include: { user: true } } },
    });

    if (!house) {
      for (const member of this.inHouse(houseId)) {
        send(member.socket, { type: "deleted" });
        member.houseId = null;
        member.roomId = null;
      }
      return;
    }

    const allowed = new Set(house.members.map((member) => member.userId));
    for (const member of this.inHouse(houseId)) {
      if (!allowed.has(member.userId)) {
        send(member.socket, {
          type: "removed",
          reason: "You are no longer in this house.",
        });
        member.houseId = null;
        member.roomId = null;
      }
    }

    const roomIds = new Set(house.rooms.map((room) => room.id));
    const lobby =
      [...house.rooms]
        .filter((room) => room.parentId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? house.rooms[0];

    for (const member of this.inHouse(houseId)) {
      if (!member.roomId || !roomIds.has(member.roomId)) {
        member.roomId = lobby?.id ?? null;
      }
      const record = house.members.find((item) => item.userId === member.userId);
      if (record) member.name = record.user.name;
    }

    this.broadcast(houseId, {
      type: "structure",
      house: {
        name: house.name,
        welcome: house.welcome,
        hasPassword: Boolean(house.passwordHash),
      },
      rooms: [...house.rooms]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map(publicRoom),
    });
    this.broadcastPresence(houseId);
  }
}
