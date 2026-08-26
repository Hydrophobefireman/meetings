import { Context, Effect, Layer, Schedule } from "effect";
import type { ResponseRec } from "./lib";

/**
 * Typed access to the Cloudflare KV binding.
 * All reads/writes go through here so handlers stay testable and
 * transport failures are tracked in the error channel.
 */
export class KV extends Context.Tag("meetings/KV")<KV, KVShape>() {}

export interface KVShape {
  readonly getJSON: <A>(key: string) => Effect.Effect<A | null, KVError>;
  readonly putJSON: <A>(key: string, value: A) => Effect.Effect<void, KVError>;
}

export class KVError {
  readonly _tag = "KVError";
  readonly cause: unknown;
  constructor(cause: unknown) {
    this.cause = cause;
  }
}

/** Retry transient KV failures: 3 attempts, exponential backoff. */
export const withRetry = <A, E, R>(
  eff: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  eff.pipe(
    Effect.retry(
      Schedule.exponential("50 millis", 2).pipe(Schedule.compose(Schedule.recurs(3))),
    ),
  );

const make = (store: KVNamespace): KVShape => ({
  getJSON: <A,>(key: string) =>
    Effect.tryPromise({
      try: () => store.get<A>(key, "json"),
      catch: (cause) => new KVError(cause),
    }),
  putJSON: (key, value) =>
    Effect.tryPromise({
      try: () => store.put(key, JSON.stringify(value)),
      catch: (cause) => new KVError(cause),
    }),
});

export const layerFrom = (store: KVNamespace): Layer.Layer<KV> =>
  Layer.succeed(KV, make(store));

export type { ResponseRec };
