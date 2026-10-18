import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 text-center">
      <div>
        <p className="font-heading text-5xl tracking-tight">No such house</p>
        <p className="mt-2 text-muted-foreground">That code does not open a door.</p>
        <Button asChild className="mt-6">
          <Link href="/">Back to the hall</Link>
        </Button>
      </div>
    </main>
  );
}
