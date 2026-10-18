"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/lib/types";

type Props = {
  title: string;
  hint: string;
  messages: ChatMessage[];
  selfId: string;
  disabled?: boolean;
  onBack?: () => void;
  onSend: (body: string) => void;
};

export function ChatPanel(props: Props) {
  const [body, setBody] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = body.trim();
    if (!next) return;
    props.onSend(next);
    setBody("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div>
          <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">
            {props.onBack ? "Whisper" : "Room"}
          </p>
          <p className="font-medium">{props.title}</p>
          <p className="text-xs text-muted-foreground">{props.hint}</p>
        </div>
        {props.onBack ? (
          <Button variant="ghost" size="sm" onClick={props.onBack}>
            Back
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-2">
        {props.messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing said yet. The first line can be ordinary.
          </p>
        ) : (
          props.messages.map((message) => {
            const mine = message.authorId === props.selfId;
            return (
              <div key={message.id} className={mine ? "text-right" : ""}>
                <p className="text-xs text-muted-foreground">
                  {mine ? "You" : message.authorName} · {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
                <p className="mt-1 inline-block max-w-full rounded-2xl bg-muted px-3 py-2 text-left text-sm break-words">
                  {message.body}
                </p>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t p-3">
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={props.disabled ? "Connecting…" : "Write to the room"}
          maxLength={1000}
          disabled={props.disabled}
          aria-label="Message"
        />
        <Button type="submit" disabled={props.disabled || !body.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
