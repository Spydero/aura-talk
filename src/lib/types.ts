export type PublicRoom = {
  id: string;
  parentId: string | null;
  name: string;
  topic: string;
  hasPassword: boolean;
  maxUsers: number;
  sortOrder: number;
};

export type HouseSummary = {
  id: string;
  name: string;
  code: string;
  welcome: string;
  hasPassword: boolean;
  ownerId: string;
  roomCount: number;
  memberCount: number;
  role: "owner" | "member";
};

export type HouseDetail = {
  id: string;
  name: string;
  code: string;
  welcome: string;
  hasPassword: boolean;
  ownerId: string;
  rooms: PublicRoom[];
};

export type ChatMessage = {
  id: string;
  roomId: string | null;
  authorId: string;
  authorName: string;
  recipientId: string | null;
  body: string;
  createdAt: string;
};

export type PresenceMember = {
  userId: string;
  name: string;
  roomId: string | null;
  away: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
};

export type SignalData =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | {
      kind: "ice";
      candidate: {
        candidate?: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      };
    };

export type ServerEvent =
  | { type: "hello"; user: { id: string; name: string } }
  | { type: "joined"; houseId: string; roomId: string | null }
  | { type: "entered"; roomId: string }
  | { type: "presence"; members: PresenceMember[] }
  | {
      type: "structure";
      house: { name: string; welcome: string; hasPassword: boolean };
      rooms: PublicRoom[];
    }
  | { type: "chat"; message: ChatMessage }
  | { type: "removed"; reason: string }
  | { type: "deleted" }
  | { type: "error"; code: string; message: string; roomId?: string }
  | { type: "signal"; fromUserId: string; data: SignalData };
