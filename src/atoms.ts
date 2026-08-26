import { Effect, Schedule, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { getEvent, type EventData, type MarkState } from "./api";

export interface Me {
  readonly pid: string | null;
  readonly name: string;
  readonly marks: Readonly<Record<string, MarkState>>;
}

export const lsKey = (id: string) => `meetings.${id}.me`;

export const loadStoredMe = (id: string): Me => {
  try {
    const saved = JSON.parse(localStorage.getItem(lsKey(id)) || "null");
    if (saved && typeof saved.pid === "string") {
      return { pid: saved.pid, name: saved.name || "", marks: {} };
    }
  } catch {}
  return { pid: null, name: "", marks: {} };
};

// Atom family for event data with live polling
export const eventAtomFamily = Atom.family((id: string) =>
  Atom.make(
    Stream.fromEffect(getEvent(id)).pipe(
      Stream.repeat(Schedule.spaced("10 seconds")),
    ),
  ).pipe(Atom.keepAlive),
);

export { AsyncResult, Atom };
