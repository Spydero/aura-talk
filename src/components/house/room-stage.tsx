"use client";

import { HeadphoneOff, MicOff, Moon, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { PresenceMember, PublicRoom } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  room: PublicRoom | null;
  welcome: string;
  people: PresenceMember[];
  elsewhere: PresenceMember[];
  selfId: string;
  isOwner: boolean;
  voiceReady: boolean;
  micError: string | null;
  peerStates: Record<string, "connecting" | "connected" | "failed">;
  volumes: Record<string, number>;
  onEnableMic: () => void;
  onRetryAudio: () => void;
  onKick: (userId: string) => void;
  onWhisper: (person: PresenceMember) => void;
  onVolume: (userId: string, value: number) => void;
};

function hue(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) % 360;
  return hash;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function RoomStage(props: Props) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="px-5 pt-5 pb-2">
        <p className="font-heading text-3xl tracking-tight">{props.room?.name ?? "Finding a room"}</p>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          {props.room?.topic || props.welcome || "The room is open."}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {props.people.length === 0 ? (
          <div className="grid h-full min-h-48 place-items-center rounded-3xl border border-dashed border-border px-6 text-center">
            <div>
              <p className="font-heading text-2xl">The floor is empty</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Share the house code. When someone walks in, they show up here as a tile, not a row in a list.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {props.people.map((person) => {
              const self = person.userId === props.selfId;
              const audio = props.peerStates[person.userId];
              return (
                <article
                  key={person.userId}
                  className={cn(
                    "flex flex-col gap-3 rounded-3xl border bg-card/80 p-4",
                    person.speaking && "speak-ring",
                    person.away && "opacity-60",
                  )}
                >
                  <div
                    className="grid size-16 place-items-center rounded-full text-xl font-semibold text-background"
                    style={{ background: `oklch(0.78 0.12 ${hue(person.userId)})` }}
                  >
                    {initials(person.name) || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {person.name} {self ? <span className="text-muted-foreground">· you</span> : null}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {person.away ? (
                        <span className="inline-flex items-center gap-1"><Moon className="size-3" /> Away</span>
                      ) : person.speaking ? (
                        <span className="text-primary">Speaking</span>
                      ) : (
                        <span>Quiet</span>
                      )}
                      {person.muted ? <MicOff className="size-3" /> : null}
                      {person.deafened ? <HeadphoneOff className="size-3" /> : null}
                    </p>
                    {!self && audio === "failed" ? (
                      <p className="mt-1 text-xs text-destructive">Audio did not connect.</p>
                    ) : null}
                    {!self && audio === "connecting" && props.voiceReady ? (
                      <p className="mt-1 text-xs text-muted-foreground">Linking audio…</p>
                    ) : null}
                  </div>
                  {!self ? (
                    <div className="mt-auto space-y-2">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Volume2 className="size-3" />
                        <Slider
                          min={0}
                          max={100}
                          value={[Math.round((props.volumes[person.userId] ?? 1) * 100)]}
                          onValueChange={(value) => props.onVolume(person.userId, (value[0] ?? 100) / 100)}
                          aria-label={`Volume for ${person.name}`}
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => props.onWhisper(person)}>
                          Whisper
                        </Button>
                        {props.isOwner ? (
                          <Button size="sm" variant="ghost" onClick={() => props.onKick(person.userId)}>
                            Walk out
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {props.elsewhere.length > 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Elsewhere in the house: {props.elsewhere.map((person) => person.name).join(", ")}
          </p>
        ) : null}
      </div>

      {!props.voiceReady ? (
        <div className="mx-5 mb-4 rounded-2xl border bg-card/80 p-4">
          <p className="text-sm">The room can hear you after the microphone opens.</p>
          {props.micError ? <p className="mt-1 text-sm text-destructive">{props.micError}</p> : null}
          <Button className="mt-3" onClick={props.onEnableMic}>
            Open microphone
          </Button>
        </div>
      ) : Object.values(props.peerStates).includes("failed") ? (
        <div className="mx-5 mb-4">
          <Button variant="secondary" onClick={props.onRetryAudio}>
            Retry audio links
          </Button>
        </div>
      ) : null}
    </section>
  );
}
