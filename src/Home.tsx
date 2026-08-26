import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ArrowRight, CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { createEvent } from "./api";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export default function Home() {
  document.title = "meetings";
  const [title, setTitle] = useState("");
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(Date.now() + 13 * 86400000),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("Give the event a name.");
    if (!range?.from || !range?.to) return setError("Pick a date range.");
    setBusy(true);
    try {
      const data = await createEvent(title.trim(), iso(range.from), iso(range.to));
      window.location.href = `/e/${data.id}`;
    } catch {
      setError("Could not create the event — check the date range.");
      setBusy(false);
    }
  }

  return (
    <section className="grid grid-cols-1 items-center gap-10 pt-6 md:grid-cols-[1.2fr_1fr] md:gap-16 md:pt-16 lg:pt-20">
      <div className="rise">
        <span className="eyebrow">Group scheduling · no accounts · free</span>
        <h1 className="mt-4 font-display text-[2.75rem] font-semibold leading-[0.98] tracking-tight text-balance sm:text-6xl lg:text-7xl">
          Find the days
          <br />
          that{" "}
          <span className="relative whitespace-nowrap italic text-accent-foreground">
            work
            {/* highlighter swipe under the word */}
            <svg
              aria-hidden="true"
              viewBox="0 0 120 12"
              preserveAspectRatio="none"
              className="absolute -bottom-1 left-0 h-[0.14em] w-full text-primary/60"
            >
              <path
                d="M2 8 C 30 3, 90 4, 118 6"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </span>
          <span className="text-primary">.</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
          Pick a range of dates and send one link. Everyone highlights the
          days they're free — the overlap surfaces itself, like a highlighter
          on a shared calendar.
        </p>

        <div className="demo mt-9 inline-flex flex-col gap-3" aria-hidden="true">
          <div className="flex gap-1.5">
            {["", "", "free", "free", "", "no", "", "free", "", "free", "free", ""].map(
              (s, i) => (
                <span
                  key={i}
                  className={`demo-cell size-7 rounded-lg shadow-inner sm:size-9 ${
                    s ? `cell-${s} border border-transparent` : "bg-secondary"
                  }`}
                />
              ),
            )}
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-card px-2.5 py-1">
              <i className="mr-1.5 inline-block size-2.5 rounded-sm bg-primary align-middle" />
              free
            </span>
            <span className="cell-no rounded-full border border-transparent px-2.5 py-1">
              can't
            </span>
            <span className="hidden items-center rounded-full border bg-card px-2.5 py-1 sm:inline-flex">
              hover the strip ↑
            </span>
          </div>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="rise rise-1 flex w-full flex-col gap-5 rounded-3xl border bg-card p-6 shadow-[0_2px_6px_rgba(26,31,38,0.04),0_24px_60px_-24px_rgba(26,31,38,0.25)] sm:p-8 md:max-w-md md:justify-self-end"
      >
        <div className="grid gap-2.5">
          <Label htmlFor="title" className="text-sm">
            Event name
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            autoComplete="off"
            placeholder="Cabin trip"
            className="h-11 rounded-xl"
          />
        </div>

        <div className="grid gap-2.5">
          <Label className="text-sm">Dates</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-11 justify-start rounded-xl px-3 font-mono text-sm font-normal"
              >
                <CalendarIcon className="size-4 text-muted-foreground" />
                {range?.from ? (
                  range.to ? (
                    <>
                      {iso(range.from)}
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      {iso(range.to)}
                    </>
                  ) : (
                    iso(range.from)
                  )
                ) : (
                  <span className="text-muted-foreground">Pick a range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={window.innerWidth >= 640 ? 2 : 1}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy} className="h-12 rounded-xl text-base">
          {busy ? "Creating…" : "Create event"}
          {!busy && <ArrowRight className="ml-1 size-4" />}
        </Button>
        <p className="-mt-2 text-center font-mono text-[11px] text-muted-foreground/80">
          any range, however long — a link is all you share
        </p>
      </form>
    </section>
  );
}
