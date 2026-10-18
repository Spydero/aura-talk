"use client";

import { ChevronDown, ChevronUp, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PresenceMember, PublicRoom } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  rooms: PublicRoom[];
  presence: PresenceMember[];
  currentRoomId: string | null;
  isOwner: boolean;
  onEnter: (roomId: string) => void;
  onCreate: (parentId: string | null) => void;
  onEdit: (room: PublicRoom) => void;
  onDelete: (room: PublicRoom) => void;
  onMove: (room: PublicRoom, direction: "up" | "down") => void;
};

export function FloorList(props: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">Floors</p>
        {props.isOwner ? (
          <Button variant="ghost" size="icon-sm" onClick={() => props.onCreate(null)} aria-label="Add a room">
            <Plus />
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <Branches {...props} parentId={null} depth={0} />
      </div>
    </div>
  );
}

function Branches(props: Props & { parentId: string | null; depth: number }) {
  const rooms = props.rooms
    .filter((room) => room.parentId === props.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return (
    <ul className="space-y-1">
      {rooms.map((room) => {
        const count = props.presence.filter((person) => person.roomId === room.id).length;
        const active = room.id === props.currentRoomId;
        return (
          <li key={room.id}>
            <div
              className={cn(
                "group flex items-center gap-1 rounded-2xl pr-1",
                active ? "bg-primary/15" : "hover:bg-muted/70",
              )}
              style={{ marginLeft: props.depth * 12 }}
            >
              <button
                type="button"
                onClick={() => props.onEnter(room.id)}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    count > 0 ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-sm font-medium">{room.name}</span>
                    {room.hasPassword ? <Lock className="size-3 text-muted-foreground" /> : null}
                  </span>
                  {room.topic ? (
                    <span className="block truncate text-xs text-muted-foreground">{room.topic}</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
              </button>
              {props.isOwner ? (
                <div className="flex shrink-0">
                  <Button variant="ghost" size="icon-xs" aria-label="Move room up" onClick={() => props.onMove(room, "up")}>
                    <ChevronUp />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Move room down" onClick={() => props.onMove(room, "down")}>
                    <ChevronDown />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Edit room" onClick={() => props.onEdit(room)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Add a room inside" onClick={() => props.onCreate(room.id)}>
                    <Plus />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Remove room" onClick={() => props.onDelete(room)}>
                    <Trash2 />
                  </Button>
                </div>
              ) : null}
            </div>
            <Branches {...props} parentId={room.id} depth={props.depth + 1} />
          </li>
        );
      })}
    </ul>
  );
}
