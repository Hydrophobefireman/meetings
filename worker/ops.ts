import { Data, Effect } from "effect";
import {
  cleanName,
  cleanTitle,
  normalizeDays,
  normalizeMarks,
  rid,
  validPid,
  type EventMeta,
  type ResponseRec,
} from "./lib";
import { KV, KVError, layerFrom, withRetry } from "./kv";

/* ---------------- typed errors ---------------- */

export class BadRequest extends Data.TaggedError("BadRequest")<{}> {}
export class NotFound extends Data.TaggedError("NotFound")<{}> {}
export class Internal {
  readonly _tag = "Internal";
  readonly cause: unknown;
  constructor(cause: unknown) {
    this.cause = cause;
  }
}

/* ---------------- keys ---------------- */

const eventKey = (id: string) => `event:${id}`;
const respKey = (id: string, pid: string) => `resp:${id}:${pid}`;
const indexKey = (id: string) => `resp-index:${id}`;

/* ---------------- operations ---------------- */

export const createEvent = (body: unknown) =>
  Effect.gen(function* () {
    const kv = yield* KV;
    const b = (body ?? {}) as Record<string, unknown>;
    const title = cleanTitle(b.title);
    // accepts { start, end } range or a legacy days array
    const days = normalizeDays(b.days ?? b);
    if (!title || !days) return yield* Effect.fail(new BadRequest());

    let id = rid(7);
    for (let i = 0; i < 3; i++) {
      const existing = yield* kv.getJSON<EventMeta>(eventKey(id));
      if (existing === null) break;
      id = rid(7);
    }

    const meta: EventMeta = { id, title, days, created: Date.now() };
    yield* withRetry(kv.putJSON(eventKey(id), meta));
    return { id };
  }).pipe(Effect.mapError((e) => (e instanceof KVError ? new Internal(e.cause) : e)));

export const getEvent = (id: string) =>
  Effect.gen(function* () {
    const kv = yield* KV;

    const meta = yield* kv.getJSON<EventMeta>(eventKey(id));
    if (meta === null) return yield* Effect.fail(new NotFound());

    const index = (yield* kv.getJSON<string[]>(indexKey(id))) ?? [];
    const rawResponses = yield* Effect.all(
      index.map((pid) => kv.getJSON<ResponseRec>(respKey(id, pid))),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((rs) => rs.filter((r): r is ResponseRec => r !== null)));

    // Ensure responses are deduplicated by name (case-insensitive) in case legacy duplicates exist
    const byName = new Map<string, ResponseRec>();
    for (const r of rawResponses.sort((a, b) => a.at - b.at)) {
      const key = r.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        byName.set(key, {
          pid: existing.pid,
          name: r.name,
          marks: { ...existing.marks, ...r.marks },
          at: r.at,
        });
      } else {
        byName.set(key, r);
      }
    }

    const responses = Array.from(byName.values()).sort((a, b) => a.at - b.at);

    return {
      id: meta.id,
      title: meta.title,
      days: meta.days,
      responses,
    };
  }).pipe(Effect.mapError((e) => (e instanceof KVError ? new Internal(e.cause) : e)));

export const saveResponse = (id: string, body: unknown) =>
  Effect.gen(function* () {
    const kv = yield* KV;

    const meta = yield* kv.getJSON<EventMeta>(eventKey(id));
    if (meta === null) return yield* Effect.fail(new NotFound());

    const b = (body ?? {}) as Record<string, unknown>;
    const name = cleanName(b.name);
    if (!name) return yield* Effect.fail(new BadRequest());

    const reqPid = validPid(b.pid);
    const indexList = (yield* kv.getJSON<string[]>(indexKey(id))) ?? [];
    const existingResponses = yield* Effect.all(
      indexList.map((p) => kv.getJSON<ResponseRec>(respKey(id, p))),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((rs) => rs.filter((r): r is ResponseRec => r !== null)));

    const lowerName = name.trim().toLowerCase();
    const existingByName = existingResponses.find(
      (r) => r.name.trim().toLowerCase() === lowerName,
    );
    const existingByPid = reqPid
      ? existingResponses.find((r) => r.pid === reqPid)
      : null;

    let targetPid: string;
    let originalAt = Date.now();

    if (existingByName) {
      // Attach to the existing person with the same name
      targetPid = existingByName.pid;
      originalAt = existingByName.at;

      // If the caller had a different old PID, delete the orphaned record from KV
      if (reqPid && reqPid !== targetPid && existingByPid) {
        yield* withRetry(kv.delete(respKey(id, reqPid)));
      }
    } else if (existingByPid) {
      // Renaming an existing participant to a new unique name
      targetPid = existingByPid.pid;
      originalAt = existingByPid.at;
    } else {
      // New participant
      targetPid = reqPid ?? rid(12);
      originalAt = Date.now();
    }

    const rec: ResponseRec = {
      pid: targetPid,
      name,
      marks: normalizeMarks(meta, b.marks),
      at: originalAt,
    };
    yield* withRetry(kv.putJSON(respKey(id, targetPid), rec));

    const updatedIndex = new Set(
      indexList.filter((p) => !reqPid || reqPid === targetPid || p !== reqPid),
    );
    updatedIndex.add(targetPid);
    yield* withRetry(kv.putJSON(indexKey(id), [...updatedIndex]));

    return { pid: targetPid };
  }).pipe(Effect.mapError((e) => (e instanceof KVError ? new Internal(e.cause) : e)));
