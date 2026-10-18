"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export function JoinGate(props: { code: string; name: string; hasPassword: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/houses/join", {
        method: "POST",
        body: JSON.stringify({ code: props.code, password: password || undefined }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enter.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border bg-card/80 p-6">
        <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">House</p>
        <h1 className="font-heading mt-2 text-4xl tracking-tight">{props.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Code {props.code}. {props.hasPassword ? "The door has a password." : "The door is open. Step in."}
        </p>
        {props.hasPassword ? (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="gate-password">Password</Label>
            <Input id="gate-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/")}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Entering…" : "Enter"}
          </Button>
        </div>
      </form>
    </main>
  );
}
