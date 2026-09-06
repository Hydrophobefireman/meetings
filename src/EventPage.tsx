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
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Link2,
  Pencil,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { getEvent, saveMe, type EventData, type MarkState } from "./api";

const FREE: MarkState = "free";
const NO: MarkState = "no";
const lsKey = (id: string) => `meetings.${id}.me`;
const TODAY = new Date().toISOString().slice(0, 10);
const PALETTE = [
  "#1f7a8c",
  "#b56576",
  "#6a994e",
  "#bc6c25",
  "#7209b7",
  "#3d5a80",
  "#e07a5f",
  "#2a9d8f",
];

interface Me {
  pid: string | null;
  name: string;
  marks: Record<string, MarkState>;
}

interface Participant {
  pid: string;
  name: string;
  marks: Record<string, MarkState>;
  color: string;
  isMe: boolean;
}

export default function EventPage({ id }: { id: string }) {
  const [ev, setEv] = useState<EventData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [me, setMe] = useState<Me>({ pid: null, name: "", marks: {} });
  const [guestMode, setGuestMode] = useState(false);
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
          if (m.pid) {
            const mine = data.responses.find((r) => r.pid === m.pid);
            if (mine) return { ...m, name: mine.name, marks: { ...mine.marks } };
          }
          if (m.name.trim()) {
            const matchByName = data.responses.find(
              (r) => r.name.trim().toLowerCase() === m.name.trim().toLowerCase(),
            );
            if (matchByName) {
              return {
                ...m,
                pid: matchByName.pid,
                name: matchByName.name,
                marks: { ...matchByName.marks },
              };
            }
          }
          return m;
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
      changeSeq.current++;
      setMe((m) => {
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

  const adoptExisting = useCallback(
    (person: { pid: string; name: string; marks: Record<string, MarkState> }) => {
      setMe({
        pid: person.pid,
        name: person.name,
        marks: { ...person.marks },
      });
      localStorage.setItem(
        lsKey(id),
        JSON.stringify({ pid: person.pid, name: person.name }),
      );
      setGuestMode(false);
    },
    [id],
  );

  const join = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      setMe((m) => ({ ...m, pid: null, name: trimmed, marks: {} }));
      setGuestMode(false);
    },
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

  if (!me.name.trim() && !guestMode) {
    return (
      <NameGate
        ev={ev}
        onJoin={join}
        onAdoptExisting={adoptExisting}
        onViewAsGuest={() => setGuestMode(true)}
      />
    );
  }

  return (
    <EventView
      ev={ev}
      me={me}
      tone={tone}
      status={status}
      setStatus={setStatus}
      scheduleSave={scheduleSave}
      setMe={setMe}
      onCycle={cycleDay}
      onPaint={applyMark}
      onEdit={bump}
    />
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
  const participants: Participant[] = useMemo(
    () => getParticipants(ev, me),
    [ev, me],
  );

  const collidingParticipant = useMemo(() => {
    const trimmed = me.name.trim().toLowerCase();
    if (!trimmed) return null;
    return (
      participants.find(
        (p) => !p.isMe && p.name.trim().toLowerCase() === trimmed,
      ) ?? null
    );
  }, [me.name, participants]);

  const tallyMap = useMemo(
    () => tally(participants, ev.days),
    [participants, ev.days],
  );
  const picks = useMemo(() => topPicks(tallyMap), [tallyMap]);

  // activeTab: "whos-free" | "edit" | pid (individual person)
  const [activeTab, setActiveTab] = useState<string>("whos-free");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // effective selected date in who's free mode (defaults to top pick or first day)
  const effectiveSelectedDate = useMemo(() => {
    if (selectedDate && ev.days.includes(selectedDate)) return selectedDate;
    if (picks.length > 0) return picks[0].d;
    return ev.days[0] ?? null;
  }, [selectedDate, picks, ev.days]);

  const selectedPerson = useMemo(
    () => participants.find((p) => p.pid === activeTab) ?? null,
    [participants, activeTab],
  );

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

  const handleSelectDate = useCallback((day: string) => {
    setSelectedDate(day);
  }, []);

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
          {ev.days.length} days · {participants.length} response
          {participants.length === 1 ? "" : "s"}
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

        {collidingParticipant && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>{collidingParticipant.name}</strong> is already in this event.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMe({
                    pid: collidingParticipant.pid,
                    name: collidingParticipant.name,
                    marks: { ...collidingParticipant.marks },
                  });
                  localStorage.setItem(
                    lsKey(ev.id),
                    JSON.stringify({
                      pid: collidingParticipant.pid,
                      name: collidingParticipant.name,
                    }),
                  );
                  setStatus(`Attached to ${collidingParticipant.name}`, "saved");
                }}
                className="font-semibold underline hover:text-amber-700 dark:hover:text-amber-100 cursor-pointer"
              >
                Edit their availability
              </button>
              <span>·</span>
              <span className="text-amber-800/70 dark:text-amber-300/70">
                or use a unique name
              </span>
            </div>
          </div>
        )}

        {/* Mode Switcher & Respondent Tabs */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t pt-3">
          <span className="eyebrow shrink-0 pr-1 text-[10px]">View</span>

          {/* Who's free button */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("whos-free");
              if (!selectedDate && picks.length > 0) {
                setSelectedDate(picks[0].d);
              }
            }}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
              activeTab === "whos-free"
                ? "border-primary bg-primary text-primary-foreground shadow-xs font-semibold"
                : "bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            <Users className="size-3.5" />
            Who's free
            {participants.length > 0 && (
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                  activeTab === "whos-free"
                    ? "bg-primary-foreground/25 text-primary-foreground font-bold"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {participants.length}
              </span>
            )}
          </button>

          {/* Edit my availability button */}
          <button
            type="button"
            onClick={() => setActiveTab("edit")}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
              activeTab === "edit"
                ? "border-foreground bg-foreground text-background shadow-xs font-semibold"
                : "bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            <Pencil className="size-3.5" />
            Edit my availability
          </button>

          {/* Individual respondent chips */}
          {participants.length > 0 && (
            <>
              <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />
              <span className="eyebrow hidden shrink-0 pr-0.5 text-[10px] sm:inline-block">
                People
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {participants.map((p) => (
                  <button
                    key={p.pid}
                    type="button"
                    onClick={() =>
                      setActiveTab(activeTab === p.pid ? "whos-free" : p.pid)
                    }
                    className={cn(
                      "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      activeTab === p.pid
                        ? "border-transparent text-white shadow-xs font-medium"
                        : "bg-card text-muted-foreground hover:border-foreground/30",
                    )}
                    style={
                      activeTab === p.pid
                        ? { backgroundColor: p.color ?? "#555" }
                        : undefined
                    }
                  >
                    <i
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          activeTab === p.pid ? "#fff" : (p.color ?? "#555"),
                      }}
                    />
                    {p.name}
                    {p.isMe && (
                      <span className="opacity-75 text-[10px] font-mono">
                        (you)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top picks row */}
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
              onClick={() => {
                setActiveTab("whos-free");
                setSelectedDate(p.d);
                jumpTo(p.d.slice(0, 7));
              }}
              title={`Jump to ${fmtLong(p.d)}`}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-3 py-1 font-mono text-xs tabular-nums transition-all hover:border-primary/50",
                (activeTab === "whos-free" && effectiveSelectedDate === p.d) ||
                  (activeTab !== "whos-free" && i === 0)
                  ? "border-primary bg-accent text-accent-foreground font-semibold"
                  : "bg-card text-muted-foreground",
              )}
            >
              {fmtShort(p.d)} · {p.free} free
              <span className={p.no > 0 ? "" : "hidden"}> · {p.no} can't</span>
            </button>
          ))
        )}
      </div>

      {/* Who's Available detail panel (shown in Who's Free mode) */}
      {activeTab === "whos-free" && effectiveSelectedDate && (
        <WhosAvailablePanel
          date={effectiveSelectedDate}
          ev={ev}
          participants={participants}
          me={me}
          onPaint={onPaint}
          onSelectDate={handleSelectDate}
          onJumpToMonth={jumpTo}
        />
      )}

      {/* Month cards grid */}
      <MonthGrid
        ev={ev}
        me={me}
        participants={participants}
        tallyMap={tallyMap}
        activeTab={activeTab}
        selectedPerson={selectedPerson}
        selectedDate={effectiveSelectedDate}
        onSelectDate={handleSelectDate}
        onCycle={onCycle}
        onPaint={onPaint}
      />

      <p className="text-center font-mono text-xs text-muted-foreground">
        {activeTab === "whos-free" &&
          "click any date on the calendar to see who's free · click top picks to jump to the best dates"}
        {activeTab === "edit" &&
          "drag to paint · tap once for free · twice for can't"}
        {selectedPerson &&
          `viewing ${selectedPerson.name}'s days · click 'Who's free' to return to group view`}
      </p>
    </section>
  );
}

/* ---------------- Who's Available Detail Panel ---------------- */

function WhosAvailablePanel({
  date,
  ev,
  participants,
  me,
  onPaint,
  onSelectDate,
  onJumpToMonth,
}: {
  date: string;
  ev: EventData;
  participants: Participant[];
  me: Me;
  onPaint: (day: string, s: MarkState | null) => void;
  onSelectDate: (day: string) => void;
  onJumpToMonth: (monthKey: string) => void;
}) {
  const free = participants.filter((p) => p.marks[date] === FREE);
  const no = participants.filter((p) => p.marks[date] === NO);
  const unmarked = participants.filter((p) => !p.marks[date]);

  const currentIndex = ev.days.indexOf(date);
  const prevDay = currentIndex > 0 ? ev.days[currentIndex - 1] : null;
  const nextDay =
    currentIndex >= 0 && currentIndex < ev.days.length - 1
      ? ev.days[currentIndex + 1]
      : null;

  const total = participants.length;
  const pct = total > 0 ? Math.round((free.length / total) * 100) : 0;
  const isEveryoneFree = total > 0 && free.length === total;

  return (
    <div className="rise rise-1 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      {/* Header with Date and Prev/Next */}
      <div className="flex flex-col gap-3 border-b pb-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="eyebrow">Who's available</span>
            {isEveryoneFree ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                <Sparkles className="size-3" /> Everyone is free!
              </span>
            ) : total > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border bg-secondary/80 px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                {free.length} of {total} free ({pct}%)
              </span>
            ) : null}
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {fmtLongWithYear(date)}
          </h2>
        </div>

        {/* Prev / Next navigation */}
        <div className="flex items-center gap-1.5 self-start sm:self-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!prevDay}
            onClick={() => {
              if (prevDay) {
                onSelectDate(prevDay);
                onJumpToMonth(prevDay.slice(0, 7));
              }
            }}
            className="h-8 rounded-lg px-2.5 font-mono text-xs"
          >
            <ChevronLeft className="mr-1 size-3.5" />
            Prev day
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!nextDay}
            onClick={() => {
              if (nextDay) {
                onSelectDate(nextDay);
                onJumpToMonth(nextDay.slice(0, 7));
              }
            }}
            className="h-8 rounded-lg px-2.5 font-mono text-xs"
          >
            Next day
            <ChevronRight className="ml-1 size-3.5" />
          </Button>
        </div>
      </div>

      {/* Breakdown: Free, Can't, Pending */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {/* Available list */}
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-3.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <span className="grid size-4 place-items-center rounded-full bg-emerald-600 text-[10px] text-white">
                <Check className="size-2.5" strokeWidth={3} />
              </span>
              Available ({free.length})
            </span>
            {total > 0 && (
              <span className="font-mono text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                {pct}%
              </span>
            )}
          </div>
          {free.length === 0 ? (
            <p className="py-2 text-xs italic text-muted-foreground">
              No one marked free yet
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {free.map((p) => (
                <span
                  key={p.pid}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/60 bg-white/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-xs dark:bg-card"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                  {p.isMe && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      (you)
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Unavailable list */}
        <div className="flex flex-col gap-2 rounded-xl border border-rose-200/60 bg-rose-50/40 p-3.5 dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-800 dark:text-rose-300">
              <span className="grid size-4 place-items-center rounded-full bg-rose-600 text-[10px] text-white">
                <X className="size-2.5" strokeWidth={3} />
              </span>
              Can't make it ({no.length})
            </span>
          </div>
          {no.length === 0 ? (
            <p className="py-2 text-xs italic text-muted-foreground">
              No conflicts
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {no.map((p) => (
                <span
                  key={p.pid}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/60 bg-white/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-xs dark:bg-card"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                  {p.isMe && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      (you)
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Unmarked list */}
        <div className="flex flex-col gap-2 rounded-xl border bg-secondary/30 p-3.5 sm:col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span className="size-2 rounded-full bg-muted-foreground/40" />
              No answer yet ({unmarked.length})
            </span>
          </div>
          {unmarked.length === 0 ? (
            <p className="py-2 text-xs italic text-muted-foreground">
              Everyone responded
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {unmarked.map((p) => (
                <span
                  key={p.pid}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground"
                >
                  <span
                    className="size-2 shrink-0 rounded-full opacity-60"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                  {p.isMe && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      (you)
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick response action for current user */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 border-t pt-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            Your status for this day:
          </span>
          {me.marks[date] === FREE ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              <Check className="size-3" strokeWidth={2.5} /> Free
            </span>
          ) : me.marks[date] === NO ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
              <X className="size-3" strokeWidth={2.5} /> Can't
            </span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground/80">
              Not marked
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={me.marks[date] === FREE ? "default" : "outline"}
            onClick={() => onPaint(date, me.marks[date] === FREE ? null : FREE)}
            className="h-8 rounded-lg px-2.5 text-xs font-medium"
          >
            <Check className="mr-1 size-3" />
            {me.marks[date] === FREE ? "Marked Free" : "I'm Free"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={me.marks[date] === NO ? "destructive" : "outline"}
            onClick={() => onPaint(date, me.marks[date] === NO ? null : NO)}
            className="h-8 rounded-lg px-2.5 text-xs font-medium"
          >
            <X className="mr-1 size-3" />
            {me.marks[date] === NO ? "Marked Can't" : "Can't Make It"}
          </Button>
          {me.marks[date] && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onPaint(date, null)}
              className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- name gate ---------------- */

function NameGate({
  ev,
  onJoin,
  onAdoptExisting,
  onViewAsGuest,
}: {
  ev: EventData;
  onJoin: (name: string) => void;
  onAdoptExisting: (person: {
    pid: string;
    name: string;
    marks: Record<string, MarkState>;
  }) => void;
  onViewAsGuest: () => void;
}) {
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);
  const [collision, setCollision] = useState<{
    pid: string;
    name: string;
    marks: Record<string, MarkState>;
  } | null>(null);
  const [tip, setTip] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    const match = ev.responses.find(
      (r) => r.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );

    if (match) {
      setCollision(match);
      return;
    }

    onJoin(trimmed);
  };

  if (collision) {
    const freeCount = Object.values(collision.marks).filter(
      (m) => m === FREE,
    ).length;
    const cantCount = Object.values(collision.marks).filter(
      (m) => m === NO,
    ).length;

    return (
      <section className="rise flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-md sm:p-8">
          <span className="eyebrow text-amber-600 dark:text-amber-400">
            Name already in use
          </span>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight break-words sm:text-3xl">
            "{collision.name}" is already here
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Someone has already submitted availability for{" "}
            <strong className="font-medium text-foreground">
              {collision.name}
            </strong>
            . Would you like to edit their availability, or use a unique name?
          </p>

          <div className="my-5 rounded-xl border bg-secondary/30 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                  {collision.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {collision.name}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {freeCount} free{cantCount > 0 ? ` · ${cantCount} can't` : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Button
              size="lg"
              className="h-12 rounded-xl text-sm font-semibold"
              onClick={() => onAdoptExisting(collision)}
            >
              <Pencil className="mr-2 size-4" />
              Edit {collision.name}'s availability
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 rounded-xl text-sm font-medium"
              onClick={() => {
                setCollision(null);
                setTip(true);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
            >
              <UserPlus className="mr-2 size-4" />
              Use a different / unique name
            </Button>
          </div>
        </div>
      </section>
    );
  }

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

        <div className="mt-6 flex flex-col gap-2.5">
          <Label htmlFor="gate-name">What's your name?</Label>
          <Input
            ref={inputRef}
            id="gate-name"
            value={value}
            maxLength={40}
            autoComplete="off"
            autoFocus
            placeholder="Your name"
            className={cn("h-12 rounded-xl text-base", shake && "animate-swap")}
            onChange={(e) => {
              setValue(e.target.value);
              if (tip) setTip(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          {tip && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Please choose a unique name or add an initial (e.g. "{value.trim()} S.")
            </p>
          )}
          <Button size="lg" className="mt-1 rounded-xl" onClick={submit}>
            Enter your availability
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="font-mono text-xs text-muted-foreground hover:text-foreground"
            onClick={onViewAsGuest}
          >
            <Users className="mr-1.5 size-3.5" />
            Or see who's free first →
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
  participants,
  tallyMap,
  activeTab,
  selectedPerson,
  selectedDate,
  onSelectDate,
  onCycle,
  onPaint,
}: {
  ev: EventData;
  me: Me;
  participants: Participant[];
  tallyMap: Map<string, { free: number; no: number; total: number }>;
  activeTab: string;
  selectedPerson: Participant | null;
  selectedDate: string | null;
  onSelectDate: (day: string) => void;
  onCycle: (day: string) => void;
  onPaint: (day: string, s: MarkState | null) => void;
}) {
  const daySet = useMemo(() => new Set(ev.days), [ev.days]);

  // per-day name lists for tooltips ("who exactly is free / can't")
  const nameMap = useMemo(() => {
    const map = new Map<string, { free: string[]; no: string[] }>();
    for (const d of ev.days) map.set(d, { free: [], no: [] });
    for (const p of participants) {
      for (const [d, v] of Object.entries(p.marks)) {
        const e = map.get(d);
        if (!e) continue;
        const displayName = p.isMe ? `${p.name} (you)` : p.name;
        if (v === FREE) e.free.push(displayName);
        else if (v === NO) e.no.push(displayName);
      }
    }
    return map;
  }, [ev.days, participants]);

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

  return (
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
              {strongDays > 0 && activeTab !== "person" && !selectedPerson && (
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
                      t={tallyMap.get(d) ?? { free: 0, no: 0, total: 0 }}
                      names={nameMap.get(d) ?? { free: [], no: [] }}
                      activeTab={activeTab}
                      selectedPerson={selectedPerson}
                      mine={me.marks[d]}
                      isSelected={selectedDate === d}
                      onSelectDate={onSelectDate}
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
  );
}

function DayCell({
  day,
  t,
  names,
  activeTab,
  selectedPerson,
  mine,
  isSelected,
  onSelectDate,
  onDown,
  onEnter,
  onTap,
}: {
  day: string;
  t: { free: number; no: number; total: number };
  names: { free: string[]; no: string[] };
  activeTab: string;
  selectedPerson: Participant | null;
  mine?: MarkState;
  isSelected: boolean;
  onSelectDate: (day: string) => void;
  onDown: (day: string) => void;
  onEnter: (day: string) => void;
  onTap: (day: string) => void;
}) {
  const isWhosFree = activeTab === "whos-free";
  const isEdit = activeTab === "edit";
  const isPerson = !isWhosFree && !isEdit && !!selectedPerson;

  const frac = t.total ? t.free / t.total : 0;
  const isToday = day === TODAY;
  const dow = new Date(day + "T00:00:00").getDay();
  const isWeekend = dow === 0 || dow === 6;

  // Single person view mark or edit mode mark
  const shownMark: MarkState | undefined = isPerson
    ? selectedPerson?.marks[day]
    : isEdit
      ? mine
      : undefined;

  let tooltip = fmtLong(day);
  if (isPerson && selectedPerson) {
    tooltip += ` — ${selectedPerson.name}: ${selectedPerson.marks[day] ?? "no answer"}`;
  } else {
    if (names.free.length) tooltip += `\nFree: ${names.free.join(", ")}`;
    if (names.no.length) tooltip += `\nCan't: ${names.no.join(", ")}`;
    if (!names.free.length && !names.no.length)
      tooltip += "\nNo one has marked this day yet";
  }

  // Handle cell click / interaction based on mode
  if (isWhosFree) {
    return (
      <button
        type="button"
        onClick={() => onSelectDate(day)}
        title={tooltip}
        aria-selected={isSelected}
        aria-label={`${fmtLong(day)}: ${t.free} of ${t.total} free, ${t.no} can't`}
        className={cn(
          "relative grid aspect-square w-full select-none place-items-center rounded-lg border text-[11px] font-medium transition-all duration-150 cursor-pointer",
          "hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 active:scale-95",
          isSelected &&
            "ring-2 ring-primary ring-offset-2 z-10 scale-105 shadow-md font-bold",
          // Heatmap backgrounds for Who's Free
          frac === 1 && t.free > 0 && "cell-free border-transparent shadow-xs",
          frac < 1 &&
            frac >= 0.6 &&
            "border-emerald-300/60 bg-emerald-100 text-emerald-950 font-semibold dark:bg-emerald-950/60 dark:text-emerald-100",
          frac < 0.6 &&
            frac >= 0.3 &&
            "border-emerald-200/50 bg-emerald-50 text-foreground dark:bg-emerald-950/30",
          frac < 0.3 &&
            frac > 0 &&
            "border-transparent bg-emerald-50/60 text-foreground dark:bg-emerald-950/20",
          frac === 0 &&
            !isWeekend &&
            "border-transparent bg-secondary/60 text-muted-foreground",
          frac === 0 &&
            isWeekend &&
            "border-transparent bg-secondary/30 text-muted-foreground/70",
        )}
      >
        {isToday && (
          <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-amber-500/70" />
        )}

        <div className="flex flex-col items-center justify-center leading-none">
          <span>{Number(day.slice(8))}</span>
          {t.total > 0 && t.free > 0 && (
            <span
              className={cn(
                "mt-0.5 text-[8.5px] font-mono leading-none tracking-tighter",
                frac === 1 ? "text-white/90" : "text-emerald-800 dark:text-emerald-300",
              )}
            >
              {t.free}/{t.total}
            </span>
          )}
        </div>

        {t.no > 0 && (
          <span
            className="absolute inset-x-1 bottom-0.5 rounded-full bg-destructive/70"
            style={{
              height: `${Math.max((t.no / Math.max(t.total, 1)) * 20, 2)}px`,
            }}
          />
        )}
      </button>
    );
  }

  // Edit mode or Person mode
  const editable = isEdit;

  return (
    <button
      type="button"
      // mouse/pen: apply on down, drag paints via onEnter; no click involved
      onPointerDown={(e) => {
        if (!editable) return;
        if (e.pointerType !== "touch") {
          e.preventDefault();
          onDown(day);
        }
      }}
      // touch: tap detected on release
      onPointerUp={(e) => {
        if (editable && e.pointerType === "touch") onTap(day);
      }}
      onPointerEnter={() => editable && onEnter(day)}
      disabled={!editable}
      title={tooltip}
      aria-label={`${fmtLong(day)}: ${
        isPerson && selectedPerson
          ? `${selectedPerson.name} ${selectedPerson.marks[day] ?? "no answer"}`
          : `${t.free} free, ${t.no} can't`
      }`}
      className={cn(
        "relative grid aspect-square w-full select-none place-items-center rounded-lg border text-[11px] font-medium transition-transform duration-100",
        "hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
        editable && "active:scale-95 cursor-pointer",
        !editable && "cursor-default",
        shownMark === FREE && "cell-free border-transparent shadow-sm",
        shownMark === NO && "cell-no border-transparent",
        !shownMark &&
          !isWeekend &&
          "border-transparent bg-secondary/60",
        !shownMark && isWeekend && "border-transparent bg-secondary/30",
        // faint consensus wash behind a person's "no answer" cells
        !shownMark && frac > 0 && "opacity-90",
      )}
      style={
        !shownMark && frac > 0
          ? {
              backgroundColor: `rgba(23, 149, 79, ${(frac * 0.45).toFixed(3)})`,
            }
          : undefined
      }
    >
      {isToday && !shownMark && (
        <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-amber-500/70" />
      )}
      {shownMark === FREE ? (
        <Check className="size-3.5 drop-shadow-sm" strokeWidth={3} />
      ) : shownMark === NO ? (
        <X className="size-3.5 text-destructive" strokeWidth={3} />
      ) : (
        Number(day.slice(8))
      )}
      {!shownMark && !isPerson && t.no > 0 && (
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

function getParticipants(ev: EventData, me: Me): Participant[] {
  const list: Participant[] = [];
  const seenNames = new Set<string>();

  ev.responses.forEach((r, idx) => {
    const lower = r.name.trim().toLowerCase();
    if (seenNames.has(lower)) {
      return;
    }
    seenNames.add(lower);

    const isMe =
      (!!me.pid && me.pid === r.pid) ||
      (!!me.name.trim() &&
        me.name.trim().toLowerCase() === lower);

    list.push({
      pid: r.pid,
      name: isMe ? me.name.trim() || r.name : r.name,
      color: PALETTE[idx % PALETTE.length],
      marks: isMe ? { ...r.marks, ...me.marks } : r.marks,
      isMe,
    });
  });

  if (me.name.trim()) {
    const lowerMe = me.name.trim().toLowerCase();
    if (!seenNames.has(lowerMe)) {
      list.push({
        pid: me.pid || "me-unsaved",
        name: me.name.trim(),
        color: PALETTE[list.length % PALETTE.length],
        marks: me.marks,
        isMe: true,
      });
    }
  }

  return list;
}

function tally(participants: Participant[], days: string[]) {
  const map = new Map<string, { free: number; no: number; total: number }>();
  for (const d of days) {
    map.set(d, { free: 0, no: 0, total: participants.length });
  }
  for (const p of participants) {
    for (const [d, v] of Object.entries(p.marks)) {
      const t = map.get(d);
      if (!t) continue;
      if (v === FREE) t.free++;
      else if (v === NO) t.no++;
    }
  }
  return map;
}

function topPicks(
  tallyMap: Map<string, { free: number; no: number; total: number }>,
) {
  return [...tallyMap]
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

function fmtLongWithYear(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
