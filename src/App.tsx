import { TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import Home from "./Home";
import EventPage from "./EventPage";

export default function App() {
  const [route] = useState(() => window.location.pathname);
  const m = route.match(/^\/e\/([a-z0-9]+)/);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto min-h-dvh max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <a
          href="/"
          className="font-display text-xl font-bold tracking-tight text-foreground no-underline"
        >
          meetings<span className="text-primary">.</span>
        </a>
      </header>
      <main className="mt-2 sm:mt-4">{m ? <EventPage id={m[1]} /> : <Home />}</main>
      </div>
    </TooltipProvider>
  );
}
