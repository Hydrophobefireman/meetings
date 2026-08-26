import { Context, Effect, Layer, Schedule, Schema } from "effect";

export class KVError extends Schema.TaggedError<KVError>()("KVError", {
  cause: Schema.Defect(),
}) {}

export interface KVShape {
  readonly getJSON: <A>(key: string) => Effect.Effect<A | null, KVError>;
  readonly putJSON: <A>(key: string, value: A) => Effect.Effect<void, KVError>;
}

export class KV extends Context.Service<KV, KVShape>()("meetings/kv/KV") {}

const retrySchedule = Schedule.max([
  Schedule.exponential("50 millis", 2),
  Schedule.recurs(3),
]);

export const layerFrom = (store: KVNamespace): Layer.Layer<KV> =>
  Layer.effect(
    KV,
    Effect.gen(function* () {
      const getJSON = Effect.fn("KV.getJSON")(function* <A>(key: string) {
        return yield* Effect.tryPromise({
          try: () => store.get<A>(key, "json"),
          catch: (cause) => new KVError({ cause }),
        });
      });

      const putJSON = Effect.fn("KV.putJSON")(function* <A>(
        key: string,
        value: A,
      ) {
        yield* Effect.tryPromise({
          try: () => store.put(key, JSON.stringify(value)),
          catch: (cause) => new KVError({ cause }),
        }).pipe(Effect.retry(retrySchedule));
      });

      return KV.of({ getJSON, putJSON });
    }),
  );
