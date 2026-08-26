import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  BadRequest,
  CreateEventResponse,
  EventData,
  MeetingsApi,
  NotFound,
  ResponseRec,
  SaveResponseResponse,
} from "@/domain";
import { KV } from "./kv";
import {
  cleanName,
  cleanTitle,
  normalizeDays,
  normalizeMarks,
  rid,
  validPid,
  type EventMeta,
} from "./lib";

const eventKey = (id: string) => `event:${id}`;
const respKey = (id: string, pid: string) => `resp:${id}:${pid}`;
const indexKey = (id: string) => `resp-index:${id}`;

export const EventsApiHandlers = HttpApiBuilder.group(
  MeetingsApi,
  "events",
  (handlers) =>
    handlers
      .handle(
        "create",
        Effect.fn("Events.create")(function* ({ payload }) {
          const kv = yield* KV;
          const title = cleanTitle(payload.title);
          const days = normalizeDays(payload);
          if (!title || !days) {
            return yield* new BadRequest({ error: "bad_request" });
          }

          let id = rid(7);
          for (let i = 0; i < 3; i++) {
            const existing = yield* kv
              .getJSON<EventMeta>(eventKey(id))
              .pipe(Effect.orDie);
            if (existing === null) break;
            id = rid(7);
          }

          const meta: EventMeta = { id, title, days, created: Date.now() };
          yield* kv.putJSON(eventKey(id), meta).pipe(Effect.orDie);
          return new CreateEventResponse({ id });
        }),
      )
      .handle(
        "getById",
        Effect.fn("Events.getById")(function* ({ params }) {
          const kv = yield* KV;
          const meta = yield* kv
            .getJSON<EventMeta>(eventKey(params.id))
            .pipe(Effect.orDie);
          if (meta === null) {
            return yield* new NotFound({ error: "not_found" });
          }

          const index =
            (yield* kv
              .getJSON<string[]>(indexKey(params.id))
              .pipe(Effect.orDie)) ?? [];
          const responses = yield* Effect.all(
            index.map((pid) =>
              kv.getJSON<ResponseRec>(respKey(params.id, pid)).pipe(Effect.orDie),
            ),
            { concurrency: "unbounded" },
          );

          const valid = responses
            .filter((r): r is ResponseRec => r !== null)
            .sort((a, b) => a.at - b.at);

          return new EventData({
            id: meta.id,
            title: meta.title,
            days: [...meta.days],
            responses: valid,
          });
        }),
      )
      .handle(
        "saveMe",
        Effect.fn("Events.saveMe")(function* ({ params, payload }) {
          const kv = yield* KV;
          const meta = yield* kv
            .getJSON<EventMeta>(eventKey(params.id))
            .pipe(Effect.orDie);
          if (meta === null) {
            return yield* new NotFound({ error: "not_found" });
          }

          const name = cleanName(payload.name);
          if (!name) {
            return yield* new BadRequest({ error: "bad_request" });
          }

          const pid = validPid(payload.pid) ?? rid(12);
          const prev = payload.pid
            ? yield* kv
                .getJSON<ResponseRec>(respKey(params.id, pid))
                .pipe(Effect.orDie)
            : null;

          const rec = new ResponseRec({
            pid,
            name,
            marks: normalizeMarks(meta, payload.marks),
            at: prev?.at ?? Date.now(),
          });
          yield* kv.putJSON(respKey(params.id, pid), rec).pipe(Effect.orDie);

          const index = new Set(
            (yield* kv
              .getJSON<string[]>(indexKey(params.id))
              .pipe(Effect.orDie)) ?? [],
          );
          if (!index.has(pid)) {
            index.add(pid);
            yield* kv
              .putJSON(indexKey(params.id), [...index])
              .pipe(Effect.orDie);
          }

          return new SaveResponseResponse({ pid });
        }),
      ),
);
