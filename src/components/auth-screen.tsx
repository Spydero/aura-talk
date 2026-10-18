"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not sign in.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await authClient.signUp.email({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not create the account.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col justify-between px-8 py-10 sm:px-14">
        <p className="font-heading text-2xl tracking-tight">JojoTeams</p>
        <div>
          <h1 className="font-heading max-w-md text-5xl leading-[1.05] tracking-tight">
            A house for voices, not a server tree.
          </h1>
          <p className="mt-4 max-w-sm text-muted-foreground">
            Open a house, share a short code, and talk in rooms. Mute, hold space to speak, or let the room hear you when you do.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">Built for small rooms. Six people fit comfortably.</p>
      </section>
      <section className="flex items-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-md rounded-3xl border bg-card/80 p-6">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              className={cn("rounded-md px-3 py-1.5 text-sm", mode === "sign-in" ? "bg-background text-foreground" : "text-muted-foreground")}
              onClick={() => {
                setMode("sign-in");
                setError(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={cn("rounded-md px-3 py-1.5 text-sm", mode === "sign-up" ? "bg-background text-foreground" : "text-muted-foreground")}
              onClick={() => {
                setMode("sign-up");
                setError(null);
              }}
            >
              Create account
            </button>
          </div>
          {mode === "sign-in" ? (
              <form className="mt-4 space-y-3" onSubmit={signIn}>
                <div className="space-y-1.5">
                  <Label htmlFor="sign-in-email">Email</Label>
                  <Input id="sign-in-email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sign-in-password">Password</Label>
                  <Input id="sign-in-password" name="password" type="password" autoComplete="current-password" minLength={8} required />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button className="w-full" type="submit" disabled={pending}>
                  {pending ? "Signing in…" : "Enter"}
                </Button>
              </form>
          ) : (
              <form className="mt-4 space-y-3" onSubmit={signUp}>
                <div className="space-y-1.5">
                  <Label htmlFor="sign-up-name">Name</Label>
                  <Input id="sign-up-name" name="name" autoComplete="name" minLength={2} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sign-up-email">Email</Label>
                  <Input id="sign-up-email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sign-up-password">Password</Label>
                  <Input id="sign-up-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button className="w-full" type="submit" disabled={pending}>
                  {pending ? "Creating…" : "Create account"}
                </Button>
              </form>
          )}
        </div>
      </section>
    </main>
  );
}
