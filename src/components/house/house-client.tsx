"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, DoorOpen, Headphones, HeadphoneOff, Menu, MessageSquare, Mic, MicOff, Moon, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChatPanel } from "@/components/house/chat-panel";
import { FloorList } from "@/components/house/floor-list";
import { RoomStage } from "@/components/house/room-stage";
import { useHouseSocket } from "@/components/house/use-house-socket";
import { api } from "@/lib/api";
import { VoiceMesh } from "@/lib/client/voice";
import type { ChatMessage, HouseDetail, PresenceMember, PublicRoom } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  house: HouseDetail;
  selfId: string;
};

export function HouseClient({ house: initialHouse, selfId }: Props) {
  const router = useRouter();
  const socket = useHouseSocket(initialHouse.id);
  const { send, sendBinary, setNotice, onSignal, onAudio } = socket;
  const announced = useRef(false);
  const voiceRef = useRef<VoiceMesh | null>(null);
  if (!voiceRef.current) voiceRef.current = new VoiceMesh();

  const [house, setHouse] = useState(initialHouse);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [voiceReady, setVoiceReady] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [mode, setMode] = useState<"activity" | "push">("activity");
  const [muted, setMuted] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [away, setAway] = useState(false);
  const [pushHeld, setPushHeld] = useState(false);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [peerStates, setPeerStates] = useState<Record<string, "connecting" | "connected" | "failed">>({});
  const [hearing, setHearing] = useState<Record<string, boolean>>({});
  const [dm, setDm] = useState<PresenceMember | null>(null);
  const [floorOpen, setFloorOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roomDialog, setRoomDialog] = useState<{ mode: "create" | "edit"; parentId: string | null; room?: PublicRoom } | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const rooms = socket.rooms ?? house.rooms;
  const roomId = socket.roomId ?? rooms.find((room) => room.parentId === null)?.id ?? rooms[0]?.id ?? null;
  const room = rooms.find((item) => item.id === roomId) ?? null;
  const isOwner = house.ownerId === selfId;

  useEffect(() => {
    if (socket.housePatch || socket.rooms) {
      setHouse((current) => ({
        ...current,
        ...(socket.housePatch ?? {}),
        rooms: socket.rooms ?? current.rooms,
      }));
    }
  }, [socket.housePatch, socket.rooms]);

  useEffect(() => {
    if (!socket.gone) return;
    toast.error(socket.gone);
    router.push("/");
    router.refresh();
  }, [socket.gone, router]);

  useEffect(() => {
    const voice = voiceRef.current;
    if (!voice) return;
    voice.onSignal = (toUserId, data) => send({ type: "signal", toUserId, data });
    voice.onSpeaking = (speaking) => send({ type: "status", speaking });
    voice.onAudioFrame = (frame) => sendBinary(frame);
    voice.onHearing = (userId, active) => {
      setHearing((current) => (current[userId] === active ? current : { ...current, [userId]: active }));
    };
    voice.onPeerState = (userId, state) => {
      setPeerStates((current) => ({ ...current, [userId]: state }));
    };
    onSignal.current = (fromUserId, data) => {
      void voice.handleSignal(fromUserId, data);
    };
    onAudio.current = (frame) => voice.play(frame);
  }, [send, sendBinary, onSignal, onAudio]);

  useEffect(() => {
    if (socket.status !== "live" || announced.current) return;
    announced.current = true;
    send({ type: "status", muted: true });
  }, [socket.status, send]);

  useEffect(() => {
    if (!voiceReady || !roomId) return;
    const ids = socket.presence.filter((person) => person.roomId === roomId).map((person) => person.userId);
    voiceRef.current?.setPeers(ids);
  }, [socket.presence, roomId, voiceReady]);

  useEffect(() => {
    let cancel = false;
    const path = dm
      ? `/api/houses/${house.id}/messages?with=${dm.userId}`
      : roomId
        ? `/api/houses/${house.id}/messages?roomId=${roomId}`
        : null;
    if (!path) return;
    api<{ messages: ChatMessage[] }>(path)
      .then((data) => {
        if (!cancel) setHistory(data.messages);
      })
      .catch((error: Error) => setNotice(error.message));
    return () => {
      cancel = true;
    };
  }, [dm, roomId, house.id, setNotice]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || mode !== "push" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      event.preventDefault();
      setPushHeld(true);
      voiceRef.current?.setPushHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space" || mode !== "push") return;
      setPushHeld(false);
      voiceRef.current?.setPushHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [mode]);

  useEffect(() => {
    return () => voiceRef.current?.stop();
  }, []);

  const messages = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const message of history) map.set(message.id, message);
    for (const message of socket.messages) {
      const match = dm
        ? (message.authorId === selfId && message.recipientId === dm.userId) ||
          (message.authorId === dm.userId && message.recipientId === selfId)
        : message.roomId === roomId && !message.recipientId;
      if (match) map.set(message.id, message);
    }
    return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [history, socket.messages, dm, roomId, selfId]);

  const people = socket.presence.filter((person) => person.roomId === roomId);
  const elsewhere = socket.presence.filter((person) => person.roomId !== roomId);

  async function enableMic() {
    try {
      setMicError(null);
      await voiceRef.current?.start(selfId);
      setVoiceReady(true);
      setMuted(false);
      voiceRef.current?.setMuted(false);
      send({ type: "status", muted: false });
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setMicError(denied ? "The browser blocked the microphone." : "The microphone did not start.");
    }
  }

  function enter(nextRoomId: string) {
    if (nextRoomId === roomId) return;
    setDm(null);
    send({ type: "enter", roomId: nextRoomId });
    setFloorOpen(false);
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : "That did not work.";
      setNotice(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const chat = (
    <ChatPanel
      title={dm ? dm.name : room?.name ?? "Room"}
      hint={dm ? "Only the two of you see this." : "Everyone standing in this room."}
      messages={messages}
      selfId={selfId}
      disabled={socket.status !== "live"}
      onBack={dm ? () => setDm(null) : undefined}
      onSend={(body) => {
        if (dm) send({ type: "dm", toUserId: dm.userId, body });
        else if (roomId) send({ type: "chat", roomId, body });
      }}
    />
  );

  const floors = (
    <FloorList
      rooms={rooms}
      presence={socket.presence}
      currentRoomId={roomId}
      isOwner={isOwner}
      onEnter={enter}
      onCreate={(parentId) => setRoomDialog({ mode: "create", parentId })}
      onEdit={(target) => setRoomDialog({ mode: "edit", parentId: target.parentId, room: target })}
      onDelete={(target) => {
        if (!window.confirm(`Remove ${target.name}? People inside move back to the lobby.`)) return;
        void run(async () => {
          await api(`/api/houses/${house.id}/rooms/${target.id}`, { method: "DELETE" });
          toast.success(`${target.name} is gone.`);
        });
      }}
      onMove={(target, direction) => {
        void run(async () => {
          await api(`/api/houses/${house.id}/rooms/${target.id}`, {
            method: "PATCH",
            body: JSON.stringify({ move: direction }),
          });
        });
      }}
    />
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setFloorOpen(true)} aria-label="Open floors">
          <Menu />
        </Button>
        <button type="button" onClick={() => router.push("/")} className="font-heading text-lg tracking-tight">
          JojoTeams
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{house.name}</p>
          <p className="text-xs text-muted-foreground">{socket.status === "live" ? "Live" : socket.status === "connecting" ? "Connecting" : "Reconnecting"}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(house.code);
            toast.success("House code copied.");
          }}
        >
          <Copy />
          {house.code}
        </Button>
        {isOwner ? (
          <Button variant="ghost" size="icon" aria-label="House settings" onClick={() => setSettingsOpen(true)}>
            <Settings />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void run(async () => {
                await api(`/api/houses/${house.id}/leave`, { method: "POST" });
                router.push("/");
                router.refresh();
              });
            }}
          >
            <DoorOpen />
            Leave
          </Button>
        )}
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setChatOpen(true)} aria-label="Open chat">
          <MessageSquare />
        </Button>
      </header>

      {socket.notice ? (
        <div className="flex items-center justify-between gap-3 border-b bg-destructive/10 px-4 py-2 text-sm">
          <p>{socket.notice}</p>
          <Button variant="ghost" size="sm" onClick={() => socket.setNotice(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r md:flex">{floors}</aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <RoomStage
            room={room}
            welcome={house.welcome}
            people={people}
            elsewhere={elsewhere}
            selfId={selfId}
            isOwner={isOwner}
            voiceReady={voiceReady}
            micError={micError}
            peerStates={peerStates}
            hearing={hearing}
            volumes={volumes}
            onEnableMic={() => void enableMic()}
            onRetryAudio={() => {
              voiceRef.current?.reset();
              const ids = socket.presence.filter((person) => person.roomId === roomId).map((person) => person.userId);
              voiceRef.current?.setPeers(ids);
              setPeerStates({});
            }}
            onKick={(userId) => {
              void run(async () => {
                await api(`/api/houses/${house.id}/kick`, { method: "POST", body: JSON.stringify({ userId }) });
                toast.success("They were walked out.");
              });
            }}
            onWhisper={(person) => {
              setDm(person);
              setChatOpen(true);
            }}
            onVolume={(userId, value) => {
              setVolumes((current) => ({ ...current, [userId]: value }));
              voiceRef.current?.setVolume(userId, value);
            }}
          />
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
            <Button
              variant={muted ? "secondary" : "default"}
              onClick={() => {
                const next = !muted;
                setMuted(next);
                voiceRef.current?.setMuted(next);
                send({ type: "status", muted: next });
              }}
              disabled={!voiceReady}
            >
              {muted ? <MicOff /> : <Mic />}
              {muted ? "Muted" : "Mic open"}
            </Button>
            <Button
              variant={deafened ? "secondary" : "outline"}
              onClick={() => {
                const next = !deafened;
                setDeafened(next);
                voiceRef.current?.setDeafened(next);
                send({ type: "status", deafened: next });
              }}
            >
              {deafened ? <HeadphoneOff /> : <Headphones />}
              {deafened ? "Deafened" : "Hearing"}
            </Button>
            <Button
              variant={away ? "secondary" : "outline"}
              onClick={() => {
                const next = !away;
                setAway(next);
                send({ type: "status", away: next });
              }}
            >
              <Moon />
              {away ? "Away" : "Here"}
            </Button>
            <div className="ml-auto flex rounded-lg border p-0.5">
              <button
                type="button"
                className={cn("rounded-md px-2 py-1 text-xs", mode === "activity" && "bg-primary text-primary-foreground")}
                onClick={() => {
                  setMode("activity");
                  voiceRef.current?.setMode("activity");
                }}
              >
                Voice activity
              </button>
              <button
                type="button"
                className={cn("rounded-md px-2 py-1 text-xs", mode === "push" && "bg-primary text-primary-foreground")}
                onClick={() => {
                  setMode("push");
                  voiceRef.current?.setMode("push");
                }}
              >
                {pushHeld ? "Holding space" : "Hold space"}
              </button>
            </div>
          </div>
        </main>
        <aside className="hidden w-80 shrink-0 border-l lg:flex">{chat}</aside>
      </div>

      <Sheet open={floorOpen} onOpenChange={setFloorOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Floors</SheetTitle>
          </SheetHeader>
          {floors}
        </SheetContent>
      </Sheet>
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>Chat</SheetTitle>
          </SheetHeader>
          {chat}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(socket.passwordRoomId)} onOpenChange={(open) => !open && socket.setPasswordRoomId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This room is locked</DialogTitle>
            <DialogDescription>The host set a password for this floor.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!socket.passwordRoomId) return;
              send({ type: "enter", roomId: socket.passwordRoomId, password });
              setPassword("");
            }}
          >
            <Label htmlFor="room-password">Password</Label>
            <Input id="room-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
            <DialogFooter>
              <Button type="submit">Enter</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <HouseSettings
        open={settingsOpen}
        house={house}
        busy={busy}
        onOpenChange={setSettingsOpen}
        onSave={(input) => {
          void run(async () => {
            const data = await api<{ house: HouseDetail }>(`/api/houses/${house.id}`, {
              method: "PATCH",
              body: JSON.stringify(input),
            });
            setHouse(data.house);
            setSettingsOpen(false);
            toast.success("House updated.");
          });
        }}
        onDelete={() => {
          void run(async () => {
            await api(`/api/houses/${house.id}`, { method: "DELETE" });
            router.push("/");
            router.refresh();
          });
        }}
      />

      <RoomDialog
        state={roomDialog}
        rooms={rooms}
        busy={busy}
        onOpenChange={(open) => !open && setRoomDialog(null)}
        onSubmit={(input) => {
          if (!roomDialog) return;
          void run(async () => {
            if (roomDialog.mode === "create") {
              await api(`/api/houses/${house.id}/rooms`, { method: "POST", body: JSON.stringify(input) });
              toast.success("Room added.");
            } else if (roomDialog.room) {
              await api(`/api/houses/${house.id}/rooms/${roomDialog.room.id}`, {
                method: "PATCH",
                body: JSON.stringify(input),
              });
              toast.success("Room updated.");
            }
            setRoomDialog(null);
          });
        }}
      />
    </div>
  );
}

function HouseSettings(props: {
  open: boolean;
  house: HouseDetail;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { name: string; welcome: string; password?: string | null }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(props.house.name);
  const [welcome, setWelcome] = useState(props.house.welcome);
  const [password, setPassword] = useState("");

  useEffect(() => {
    setName(props.house.name);
    setWelcome(props.house.welcome);
    setPassword("");
  }, [props.house, props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>House keys</DialogTitle>
          <DialogDescription>Name, welcome line, and the password on the front door.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            props.onSave({
              name,
              welcome,
              ...(password ? { password } : {}),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="house-name">Name</Label>
            <Input id="house-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="house-welcome">Welcome</Label>
            <Input id="house-welcome" value={welcome} onChange={(event) => setWelcome(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="house-password">New password</Label>
            <Input id="house-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={props.house.hasPassword ? "Leave blank to keep the current one" : "Optional"} />
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm("Close this house for everyone?")) props.onDelete();
              }}
            >
              Close house
            </Button>
            <div className="flex gap-2">
              {props.house.hasPassword ? (
                <Button type="button" variant="outline" disabled={props.busy} onClick={() => props.onSave({ name, welcome, password: null })}>
                  Remove password
                </Button>
              ) : null}
              <Button type="submit" disabled={props.busy}>Save</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoomDialog(props: {
  state: { mode: "create" | "edit"; parentId: string | null; room?: PublicRoom } | null;
  rooms: PublicRoom[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; topic: string; parentId: string | null; maxUsers: number; password?: string | null }) => void;
}) {
  const room = props.state?.room;
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [maxUsers, setMaxUsers] = useState(16);
  const [password, setPassword] = useState("");

  useEffect(() => {
    setName(room?.name ?? "");
    setTopic(room?.topic ?? "");
    setParentId(props.state?.parentId ?? "");
    setMaxUsers(room?.maxUsers ?? 16);
    setPassword("");
  }, [props.state, room]);

  return (
    <Dialog open={Boolean(props.state)} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.state?.mode === "edit" ? "Edit room" : "New room"}</DialogTitle>
          <DialogDescription>Rooms are floors in the house. Nest them up to three deep.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit({
              name,
              topic,
              parentId: parentId || null,
              maxUsers,
              ...(password ? { password } : props.state?.mode === "edit" ? {} : { password: null }),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="room-name">Name</Label>
            <Input id="room-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-topic">Topic</Label>
            <Input id="room-topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-parent">Inside</Label>
            <select
              id="room-parent"
              className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">Top floor</option>
              {props.rooms
                .filter((item) => item.id !== room?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-cap">People allowed</Label>
            <Input
              id="room-cap"
              type="number"
              min={2}
              max={32}
              value={maxUsers}
              onChange={(event) => setMaxUsers(Number(event.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-lock">Password</Label>
            <Input id="room-lock" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={room?.hasPassword ? "Leave blank to keep" : "Optional"} />
          </div>
          <DialogFooter>
            {props.state?.mode === "edit" && room?.hasPassword ? (
              <Button
                type="button"
                variant="outline"
                disabled={props.busy}
                onClick={() =>
                  props.onSubmit({ name, topic, parentId: parentId || null, maxUsers, password: null })
                }
              >
                Remove password
              </Button>
            ) : null}
            <Button type="submit" disabled={props.busy || !name.trim()}>
              Save room
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
