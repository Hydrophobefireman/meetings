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
    const responses = yield* Effect.all(
      index.map((pid) => kv.getJSON<ResponseRec>(respKey(id, pid))),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((rs) => rs.filter((r): r is ResponseRec => r !== null)));

    return {
      id: meta.id,
      title: meta.title,
      days: meta.days,
      responses: responses.sort((a, b) => a.at - b.at),
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

    const pid = validPid(b.pid) ?? rid(12);
    const prev = b.pid ? yield* kv.getJSON<ResponseRec>(respKey(id, pid)) : null;

    const rec: ResponseRec = {
      pid,
      name,
      marks: normalizeMarks(meta, b.marks),
      at: prev?.at ?? Date.now(),
    };
    yield* withRetry(kv.putJSON(respKey(id, pid), rec));

    const index = new Set((yield* kv.getJSON<string[]>(indexKey(id))) ?? []);
    if (!index.has(pid)) {
      index.add(pid);
      yield* withRetry(kv.putJSON(indexKey(id), [...index]));
    }

    return { pid };
  }).pipe(Effect.mapError((e) => (e instanceof KVError ? new Internal(e.cause) : e)));
