import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import {
  BadRequest,
  EventData,
  MeetingsApi,
  NotFound,
  type MarkState,
  type ResponseRec,
} from "./domain";

export { BadRequest, EventData, NotFound, type MarkState, type ResponseRec };

// Client layer using browser's native fetch
const clientEffect = HttpApiClient.make(MeetingsApi, {
  baseUrl: window.location.origin,
}).pipe(Effect.provide(FetchHttpClient.layer));

export const getClient = () => clientEffect;

export const createEvent = (
  title: string,
  start?: string,
  end?: string,
  days?: readonly string[],
) =>
  Effect.gen(function* () {
    const client = yield* getClient();
    return yield* client.events.create({
      payload: { title, start, end, days },
    });
  });

export const getEvent = (id: string) =>
  Effect.gen(function* () {
    const client = yield* getClient();
    return yield* client.events.getById({ params: { id } });
  });

export const saveMe = (
  id: string,
  body: {
    readonly pid?: string | undefined;
    readonly name: string;
    readonly marks: Readonly<Record<string, MarkState>>;
  },
) =>
  Effect.gen(function* () {
    const client = yield* getClient();
    return yield* client.events.saveMe({
      params: { id },
      payload: body,
    });
  });
