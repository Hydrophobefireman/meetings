import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Check, Link2, X } from "lucide-react";
import { getEvent, saveMe, type EventData, type MarkState } from "./api";

const FREE: MarkState = "free";
const NO: MarkState = "no";
const lsKey = (id: string) => `meetings.${id}.me`;
const TODAY = new Date().toISOString().slice(0, 10);
const PALETTE = [
  "#1f7a8c", "#b56576", "#6a994e", "#bc6c25",
  "#7209b7", "#3d5a80", "#e07a5f", "#2a9d8f",
];

interface Me {
  pid: string | null;
  name: string;
  marks: Record<string, MarkState>;
}

interface Person {
  pid: string;
  name: string;
  marks: Record<string, MarkState>;
  color?: string;
}

export default function EventPage({ id }: { id: string }) {
  const [ev, setEv] = useState<EventData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [me, setMe] = useState<Me>({ pid: null, name: "", marks: {} });
  const [status, setStatusText] = useState("");
  const [tone, setTone] = useState<"idle" | "dirty" | "saved" | "error">("idle");
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bump = useCallback(() => {
    changeSeq.current++;
  }, []);
  // always-latest state for the debounced save (avoids stale closures)
  const meRef = useRef(me);
  meRef.current = me;
  const changeSeq = useRef(0);

  const setStatus = (text: string, t: typeof tone = "idle") => {
    setStatusText(text);
    setTone(t);
  };

  // restore identity + load event
  useEffect(() => {
    let alive = true;
    try {
      const saved = JSON.parse(localStorage.getItem(lsKey(id)) || "null");
      if (saved)
        setMe((m) => ({
          ...m,
          pid: saved.pid || null,
          name: saved.name || "",
        }));
    } catch {}
    getEvent(id)
      .then((data) => {
        if (!alive) return;
        setEv(data);
        document.title = `${data.title} — meetings`;
        // don't clobber edits the user made while the request was in flight
        if (dirty.current) return;
        setMe((m) => {
          if (!m.pid) return m;
          const mine = data.responses.find((r) => r.pid === m.pid);
          return mine ? { ...m, marks: { ...mine.marks } } : m;
        });
      })
      .catch(() => alive && setNotFound(true));
    return () => {
      alive = false;
    };
  }, [id]);

  // polling
  useEffect(() => {
    if (!ev) return;
    const t = setInterval(async () => {
      if (document.hidden || dirty.current) return;
      try {
        const data = await getEvent(ev.id);
        setEv((cur) => {
          if (!cur) return cur;
          const same =
            JSON.stringify(data.responses.filter((r) => r.pid !== me.pid)) ===
            JSON.stringify(cur.responses.filter((r) => r.pid !== me.pid));
          return same ? cur : { ...cur, responses: data.responses };
        });
      } catch {}
    }, 10000);
    return () => clearInterval(t);
  }, [ev, me.pid]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    const m = meRef.current;
    setStatus(
      m.name.trim() ? "Unsaved" : "Add your name to save",
      m.name.trim() ? "dirty" : "idle",
    );
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { pid, name, marks } = meRef.current;
      if (!name.trim()) return;
      const seq = changeSeq.current;
      setStatus("Saving…", "dirty");
      try {
        const res = await saveMe(id, { pid, name: name.trim(), marks });
        setMe((cur) => ({ ...cur, pid: res.pid }));
        localStorage.setItem(
          lsKey(id),
          JSON.stringify({ pid: res.pid, name: name.trim() }),
        );
        // stay dirty if the user edited while this save was in flight
        dirty.current = seq !== changeSeq.current;
        if (!dirty.current) setStatus("Saved", "saved");
      } catch {
        setStatus("Save failed", "error");
      }
    }, 600);
  }, [id]);

  const applyMark = useCallback(
    (day: string, s: MarkState | null) => {
      changeSeq.current++;      setMe((m) => {
        const next = { ...m.marks };
        if (s) next[day] = s;
        else delete next[day];
        return { ...m, marks: next };
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const cycleDay = useCallback(
    (day: string) => {
      const cur = meRef.current.marks[day];
      applyMark(day, cur === FREE ? NO : cur === NO ? null : FREE);
    },
    [applyMark],
  );

  const join = useCallback(
    (raw: string) => setMe((m) => ({ ...m, name: raw.trim() })),
    [],
  );

  if (notFound) {
    document.title = "meetings";
    return (
      <section className="rise py-20 text-center">
        <span className="eyebrow">404</span>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Event not found
        </h1>
        <p className="mt-3 text-muted-foreground">
          The link may have a typo, or the event was removed.
        </p>
        <Button asChild size="lg" className="mt-8 rounded-xl">
          <a href="/">Plan something new</a>
        </Button>
      </section>
    );
  }
  if (!ev)
    return (
      <div className="rise py-16 font-mono text-muted-foreground">loading…</div>
    );

  if (!me.name.trim()) return <NameGate ev={ev} onJoin={join} />;

  return (
    <EventView ev={ev} me={me} tone={tone} status={status} setStatus={setStatus} scheduleSave={scheduleSave} setMe={setMe} onCycle={cycleDay} onPaint={applyMark} onEdit={bump} />
  );
}

function EventView({
  ev,
  me,
  tone,
  status,
  setStatus,
  scheduleSave,
  setMe,
  onCycle,
  onPaint,
  onEdit,
}: {
  ev: EventData;
  me: Me;
  tone: "idle" | "dirty" | "saved" | "error";
  status: string;
  setStatus: (text: string, t?: "idle" | "dirty" | "saved" | "error") => void;
  scheduleSave: () => void;
  setMe: React.Dispatch<React.SetStateAction<Me>>;
  onCycle: (day: string) => void;
  onPaint: (day: string, s: MarkState | null) => void;
  onEdit: () => void;
}) {
  // who's being viewed: null = consensus, otherwise one person's days
  const [who, setWho] = useState<string | null>(null);

  const people: Person[] = useMemo(
    () =>
      ev.responses.map((r, i) => ({
        ...r,
        color: PALETTE[i % PALETTE.length],
      })),
    [ev.responses],
  );
  const selected = people.find((p) => p.pid === who);

  return (
    <section className="flex flex-col gap-4 sm:gap-5">
      <header className="rise">
        <div className="flex items-start justify-between gap-3">
          <span className="eyebrow mt-1.5">Availability</span>
          <CopyLink />
        </div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight break-words sm:text-5xl">
          {ev.title}
        </h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground sm:text-sm">
          {fmtShort(ev.days[0])}
          {ev.days.length > 1 && ` – ${fmtShort(ev.days[ev.days.length - 1])}`}
          {" · "}
          {ev.days.length} days · {ev.responses.length} response
          {ev.responses.length === 1 ? "" : "s"}
        </p>
      </header>

      {/* sticky toolbar */}
      <div className="sticky top-2 z-20 rise rise-1 rounded-2xl border bg-card/95 p-4 shadow-md backdrop-blur sm:p-5">
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end sm:gap-x-5">
          <Label htmlFor="name" className="sm:hidden">
            Your name
          </Label>
          <div className="relative sm:w-64">
            <span className="pointer-events-none absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-primary/70" />
            <Input
              id="name"
              value={me.name}
              maxLength={40}
              autoComplete="off"
              placeholder="Your name"
              className="h-10 rounded-xl pl-7"
              onChange={(e) => {
                const v = e.target.value;
                onEdit();
                setMe((m) => ({ ...m, name: v }));
                setStatus(
                  v.trim() ? "Unsaved" : "Add your name to save",
                  v.trim() ? "dirty" : "idle",
                );
                scheduleSave();
              }}
            />
          </div>
          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <span className="cell-free flex items-center rounded-full px-2.5 py-1 font-medium">
              free
            </span>
            <span className="cell-no flex items-center rounded-full px-2.5 py-1 font-medium">
              can't
            </span>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground sm:justify-self-end">
            <i
              className={cn(
                "size-2 rounded-full",
                tone === "saved" && "bg-primary",
                tone === "dirty" && "bg-yellow-500",
                tone === "error" && "bg-destructive",
                tone === "idle" && "bg-border",
              )}
            />
            {status || "\u00A0"}
          </span>
        </div>

        {/* who bar */}
        {people.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto border-t pt-3">
            <span className="eyebrow shrink-0 pr-1">Who</span>
            <button
              type="button"
              onClick={() => setWho(null)}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                who === null
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:border-foreground/30",
              )}
            >
              Everyone
            </button>
            {people.map((p) => (
              <button
                key={p.pid}
                type="button"
                onClick={() => setWho(who === p.pid ? null : p.pid)}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  who === p.pid
                    ? "border-transparent text-white"
                    : "bg-card text-muted-foreground hover:border-foreground/30",
                )}
                style={
                  who === p.pid ? { backgroundColor: p.color ?? "#555" } : undefined
                }
              >
                <i
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: who === p.pid ? "#fff" : (p.color ?? "#555"),
                  }}
                />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <MonthGrid
        ev={ev}
        me={me}
        view={selected ?? null}
        onCycle={onCycle}
        onPaint={onPaint}
      />

      <p className="text-center font-mono text-xs text-muted-foreground">
        drag to paint · tap once for free · twice for can't
        {selected && ` · viewing ${selected.name}'s days`}
      </p>
    </section>
  );
}

/* ---------------- name gate ---------------- */

function NameGate({ ev, onJoin }: { ev: EventData; onJoin: (name: string) => void }) {
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);

  const submit = () => {
    if (!value.trim()) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    onJoin(value);
  };

  return (
    <section className="rise flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-md sm:p-8">
        <span className="eyebrow">Availability</span>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight break-words sm:text-3xl">
          {ev.title}
        </h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground sm:text-sm">
          {fmtShort(ev.days[0])}
          {ev.days.length > 1 && ` – ${fmtShort(ev.days[ev.days.length - 1])}`}
          {" · "}
          {ev.responses.length} response
          {ev.responses.length === 1 ? "" : "s"}
        </p>

        <div className="mt-6 grid gap-2">
          <Label htmlFor="gate-name">What's your name?</Label>
          <Input
            id="gate-name"
            value={value}
            maxLength={40}
            autoComplete="off"
            autoFocus
            placeholder="Your name"
            className={cn("h-12 rounded-xl text-base", shake && "animate-swap")}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button size="lg" className="mt-2 rounded-xl" onClick={submit}>
            Enter your availability
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- month cards ---------------- */

function MonthGrid({
  ev,
  me,
  view,
  onCycle,
  onPaint,
}: {
  ev: EventData;
  me: Me;
  view: Person | null;
  onCycle: (day: string) => void;
  onPaint: (day: string, s: MarkState | null) => void;
}) {
  const daySet = useMemo(() => new Set(ev.days), [ev.days]);
  const tallyMap = useMemo(() => tally(ev, me), [ev, me]);
  const picks = useMemo(() => topPicks(ev, me), [ev, me]);

  // per-day name lists for tooltips ("who exactly is free / can't")
  const nameMap = useMemo(() => {
    const sources: { name: string; marks: Record<string, MarkState> }[] = [
      ...ev.responses.map((r) => ({ name: r.name, marks: r.marks })),
      ...(me.pid ? [{ name: `${me.name.trim() || "You"} (you)`, marks: me.marks }] : [{ name: "You (unsaved)", marks: me.marks }]),
    ];
    const map = new Map<string, { free: string[]; no: string[] }>();
    for (const d of ev.days) map.set(d, { free: [], no: [] });
    for (const s of sources) {
      for (const [d, v] of Object.entries(s.marks)) {
        const e = map.get(d);
        if (!e) continue;
        if (v === FREE) e.free.push(s.name);
        else if (v === NO) e.no.push(s.name);
      }
    }
    return map;
  }, [ev, me]);

  // drag-to-paint state, shared across all month cards
  const paint = useRef<{ state: MarkState | null } | null>(null);

  const dayDown = useCallback(
    (day: string) => {
      const cur = me.marks[day];
      const s = cur === FREE ? NO : cur === NO ? null : FREE;
      paint.current = { state: s };
      onPaint(day, s);
    },
    [me.marks, onPaint],
  );

  const dayEnter = useCallback(
    (day: string) => {
      if (!paint.current) return;
      onPaint(day, paint.current.state);
    },
    [onPaint],
  );

  useEffect(() => {
    const up = () => {
      if (!paint.current) return;
      const p = paint.current;
      setTimeout(() => {
        if (paint.current === p) paint.current = null;
      }, 0);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const months = useMemo(() => {
    const byMonth = new Map<string, string[]>();
    for (const d of ev.days) {
      const k = d.slice(0, 7);
      byMonth.set(k, [...(byMonth.get(k) ?? []), d]);
    }
    return [...byMonth.keys()].sort().map((k) => {
      const [y, m] = k.split("-").map(Number) as [number, number];
      const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
      return { key: k, label, days: byMonth.get(k)! };
    });
  }, [ev.days]);

  const jumpTo = useCallback((monthKey: string) => {
    const el = document.getElementById(`mo-${monthKey}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const card = el?.querySelector(".month-body");
    if (card) {
      card.classList.remove("flash");
      void (card as HTMLElement).offsetWidth;
      card.classList.add("flash");
    }
  }, []);

  return (
    <>
      <div className="rise rise-2 flex h-8 items-center gap-2 overflow-x-auto">
        <span className="eyebrow shrink-0 pr-1">Top picks</span>
        {picks.length === 0 ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
            no availability marked yet
          </span>
        ) : (
          picks.map((p, i) => (
            <button
              key={p.d}
              type="button"
              onClick={() => jumpTo(p.d.slice(0, 7))}
              title={`Jump to ${new Date(p.d + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })}`}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-3 py-1 font-mono text-xs tabular-nums transition-colors hover:border-primary/50",
                i === 0
                  ? "border-primary bg-accent text-accent-foreground"
                  : "bg-card text-muted-foreground",
              )}
            >
              {fmtShort(p.d)} · {p.free} free
              <span className={p.no > 0 ? "" : "hidden"}> · {p.no} can't</span>
            </button>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((mo) => {
          const strongDays = mo.days.filter(
            (d) =>
              (tallyMap.get(d)?.free ?? 0) > (tallyMap.get(d)?.total ?? 1) / 2,
          ).length;
          return (
            <div
              key={mo.key}
              id={`mo-${mo.key}`}
              className="month-card rounded-2xl border bg-card shadow-sm"
            >
              <div className="flex items-baseline justify-between px-3 pt-3 sm:px-4">
                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {mo.label}
                </h2>
                {strongDays > 0 && !view && (
                  <span className="font-mono text-[10px] text-accent-foreground">
                    {strongDays} good
                  </span>
                )}
              </div>
              <div className="month-body m-1.5 rounded-xl p-1.5 sm:m-2 sm:p-2">
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {"SMTWTFS".split("").map((w, i) => (
                    <span
                      key={i}
                      className={cn(
                        "pb-1 font-mono text-[9px]",
                        i === 0 || i === 6
                          ? "text-destructive/60"
                          : "text-muted-foreground/70",
                      )}
                    >
                      {"SUMTWTFS"[i]}
                    </span>
                  ))}
                  {calendarDays(mo.key).map((d, i) => {
                    if (!d) return <span key={`b${i}`} />;
                    if (!daySet.has(d))
                      return (
                        <span
                          key={d}
                          aria-hidden="true"
                          className="grid aspect-square w-full select-none place-items-center text-[11px] text-border"
                        >
                          {Number(d.slice(8))}
                        </span>
                      );
                    return (
                      <DayCell
                        key={d}
                        day={d}
                        t={tallyMap.get(d)!}
                        names={nameMap.get(d)!}
                        view={view}
                        mine={me.marks[d]}
                        editable={!view}
                        onTap={onCycle}
                        onDown={dayDown}
                        onEnter={dayEnter}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function DayCell({
  day,
  t,
  names,
  view,
  mine,
  editable,
  onDown,
  onEnter,
  onTap,
}: {
  day: string;
  t: { free: number; no: number; total: number };
  names: { free: string[]; no: string[] };
  view: Person | null;
  mine?: MarkState;
  editable: boolean;
  onTap: (day: string) => void;
  onDown: (day: string) => void;
  onEnter: (day: string) => void;
}) {
  const frac = t.total ? t.free / t.total : 0;
  const isToday = day === TODAY;
  const dow = new Date(day + "T00:00:00").getDay();
  const isWeekend = dow === 0 || dow === 6;

  // viewing one person: their mark drives the cell
  const shown: MarkState | undefined =
    view ? (view.marks[day] ?? undefined) : (mine ?? undefined);
  const isMineShown = !view && mine !== undefined;

  let tooltip = fmtLong(day);
  if (view) {
    tooltip += ` — ${view.name}: ${view.marks[day] ?? "no answer"}`;
  } else {
    if (names.free.length)
      tooltip += `\nFree: ${names.free.join(", ")}`;
    if (names.no.length) tooltip += `\nCan't: ${names.no.join(", ")}`;
    if (!names.free.length && !names.no.length)
      tooltip += "\nNo one has marked this day yet";
  }

  return (
    <button
      type="button"
      // mouse/pen: apply on down, drag paints via onEnter; no click involved
      onPointerDown={(e) => {
        if (!editable) return;
        if (e.pointerType !== "touch") {
          e.preventDefault(); // no compatibility mouse events / click
          onDown(day);
        }
      }}
      // touch: implicit pointer capture kills enter events during drags,
      // so a tap is detected on release instead
      onPointerUp={(e) => {
        if (editable && e.pointerType === "touch") onTap(day);
      }}
      onPointerEnter={() => editable && onEnter(day)}
      disabled={!!view}
      title={tooltip}
      aria-label={`${fmtLong(day)}: ${
        view ? `${view.name} ${view.marks[day] ?? "no answer"}` : `${t.free} free, ${t.no} can't`
      }`}
      className={cn(
        "relative grid aspect-square w-full select-none place-items-center rounded-lg border text-[11px] font-medium transition-transform duration-100",
        "hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
        editable && "active:scale-95 cursor-pointer",
        view && "cursor-default",
        shown === FREE && "cell-free border-transparent shadow-sm",
        shown === NO && "cell-no border-transparent",
        !shown &&
          !isWeekend &&
          "border-transparent bg-secondary/60",
        !shown && isWeekend && "border-transparent bg-secondary/30",
        // faint consensus wash behind a person's "no answer" cells
        view && !shown && frac > 0 && "opacity-90",
      )}
      style={
        !shown && frac > 0
          ? { backgroundColor: `rgba(23, 149, 79, ${(frac * 0.45).toFixed(3)})` }
          : undefined
      }
    >
      {isToday && !shown && (
        <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-amber-500/70" />
      )}
      {shown === FREE ? (
        <Check className="size-3.5 drop-shadow-sm" strokeWidth={3} />
      ) : shown === NO ? (
        <X className="size-3.5 text-destructive" strokeWidth={3} />
      ) : (
        Number(day.slice(8))
      )}
      {!shown && !view && t.no > 0 && (
        <span
          className="absolute inset-x-1 bottom-0.5 rounded-full bg-destructive/70"
          style={{
            height: `${Math.max((t.no / Math.max(t.total, 1)) * 26, 2)}px`,
          }}
        />
      )}
    </button>
  );
}

/* ---------------- misc ---------------- */

function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="font-mono text-xs text-muted-foreground"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              window.prompt("Copy this link", window.location.href);
            }
          }}
        >
          <Link2 className="size-3.5" />
          {copied ? "Copied ✓" : "Copy link"}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Share it with your group</TooltipContent>
    </Tooltip>
  );
}

function tally(ev: EventData, me: Me) {
  const sources = [
    ...ev.responses.filter((r) => r.pid !== me.pid).map((r) => r.marks),
    me.marks,
  ];
  const map = new Map<string, { free: number; no: number; total: number }>();
  for (const d of ev.days) map.set(d, { free: 0, no: 0, total: sources.length });
  for (const m of sources) {
    for (const [d, v] of Object.entries(m)) {
      const t = map.get(d);
      if (!t) continue;
      if (v === FREE) t.free++;
      else if (v === NO) t.no++;
    }
  }
  return map;
}

function topPicks(ev: EventData, me: Me) {
  return [...tally(ev, me)]
    .map(([d, t]) => ({ d, ...t }))
    .filter((x) => x.free > 0)
    .sort((a, b) => b.free - a.free || a.no - b.no || a.d.localeCompare(b.d))
    .slice(0, 6);
}

function calendarDays(key: string): (string | null)[] {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const n = new Date(y, m, 0).getDate();
  const offset = new Date(y, m - 1, 1).getDay();
  const out: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let i = 1; i <= n; i++) out.push(`${key}-${String(i).padStart(2, "0")}`);
  return out;
}

function fmtShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function fmtLong(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
