"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { HouseDetail, HouseSummary } from "@/lib/types";

type Props = {
  name: string;
  houses: HouseSummary[];
};

export function Hall({ name, houses }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function join(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setJoinError(null);
    try {
      const data = await api<{ house: HouseDetail }>("/api/houses/join", {
        method: "POST",
        body: JSON.stringify({ code, password: password || undefined }),
      });
      router.push(`/house/${data.house.code}`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not join.";
      if (message.toLowerCase().includes("password")) setNeedsPassword(true);
      setJoinError(message);
    } finally {
      setPending(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const data = await api<{ house: HouseDetail }>("/api/houses", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          welcome: String(form.get("welcome") ?? ""),
        }),
      });
      setOpen(false);
      router.push(`/house/${data.house.code}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the house.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-8">
      <header className="flex items-center justify-between gap-3">
        <p className="font-heading text-2xl tracking-tight">JojoTeams</p>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{name}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void authClient.signOut().then(() => {
                router.push("/sign-in");
                router.refresh();
              });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <section className="mt-12">
        <h1 className="font-heading text-4xl tracking-tight">Houses you keep</h1>
        <p className="mt-2 max-w-lg text-muted-foreground">
          Each house has a code, a lobby, and as many rooms as the host wants to stack. Walk in, or open a new one.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {houses.length === 0 ? (
            <div className="rounded-3xl border border-dashed p-6 sm:col-span-2">
              <p className="font-medium">No houses yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Open one and send the code, or walk into a house someone already started.
              </p>
            </div>
          ) : (
            houses.map((house) => (
              <button
                key={house.id}
                type="button"
                onClick={() => router.push(`/house/${house.code}`)}
                className="rounded-3xl border bg-card/70 p-5 text-left transition hover:border-primary/50"
              >
                <p className="font-heading text-2xl tracking-tight">{house.name}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {house.roomCount} {house.roomCount === 1 ? "room" : "rooms"} · {house.memberCount} {house.memberCount === 1 ? "member" : "members"}
                </p>
                <p className="mt-4 text-xs tracking-[0.18em] text-primary uppercase">
                  {house.role === "owner" ? "Host" : "Guest"} · {house.code}
                </p>
              </button>
            ))
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button type="button" className="rounded-3xl border border-dashed p-5 text-left hover:bg-muted/40">
                <p className="font-heading text-2xl tracking-tight">Open a house</p>
                <p className="mt-2 text-sm text-muted-foreground">You become the host. The lobby is already there.</p>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Open a house</DialogTitle>
                <DialogDescription>A short code is minted when the house exists.</DialogDescription>
              </DialogHeader>
              <form className="space-y-3" onSubmit={create}>
                <div className="space-y-1.5">
                  <Label htmlFor="new-house">Name</Label>
                  <Input id="new-house" name="name" minLength={2} maxLength={40} required placeholder="Night raid" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-welcome">Welcome line</Label>
                  <Input id="new-welcome" name="welcome" maxLength={180} placeholder="Shoes by the door." />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={pending}>Create</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section className="mt-12 rounded-3xl border bg-card/60 p-5">
        <h2 className="font-heading text-2xl tracking-tight">Walk in with a code</h2>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={join}>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="code">House code</Label>
            <Input
              id="code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="K7MQ2P"
              autoCapitalize="characters"
              required
            />
          </div>
          {needsPassword ? (
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="door-password">Password</Label>
              <Input id="door-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          ) : null}
          <Button type="submit" disabled={pending}>Enter</Button>
        </form>
        {joinError ? <p className="mt-3 text-sm text-destructive">{joinError}</p> : null}
      </section>
    </main>
  );
}
