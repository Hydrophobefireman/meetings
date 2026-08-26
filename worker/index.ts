import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { layerFrom, KV } from "./kv";
import { createEvent, getEvent, saveResponse, type BadRequest, type NotFound, type Internal } from "./ops";
import { CreateEventBody, SaveResponseBody } from "./schema";

type Bindings = {
  Store: KVNamespace;
  ASSETS: Fetcher;
};

/** Convert domain errors into typed JSON HTTP responses. */
const respond = <A>(
  eff: Effect.Effect<A, BadRequest | NotFound | Internal, KV>,
  status = 200,
) =>
  eff.pipe(
    Effect.flatMap((a) => HttpServerResponse.json(a, { status })),
    Effect.catchTags({
      BadRequest: () =>
        HttpServerResponse.json({ error: "bad_request" }, { status: 400 }),
      NotFound: () =>
        HttpServerResponse.json({ error: "not_found" }, { status: 404 }),
      Internal: (e) =>
        Effect.logError(e.cause).pipe(
          Effect.andThen(
            HttpServerResponse.json({ error: "internal_error" }, { status: 500 }),
          ),
        ),
    }),
  );

/* ---------------- routes ---------------- */

const createRoute = Effect.gen(function* () {
  const body = yield* HttpServerRequest.schemaBodyJson(CreateEventBody);
  return yield* respond(createEvent(body), 201);
}).pipe(
  Effect.catchTags({
    ParseError: () =>
      HttpServerResponse.json({ error: "bad_request" }, { status: 400 }),
    RequestError: () =>
      HttpServerResponse.json({ error: "bad_request" }, { status: 400 }),
  }),
);

const getRoute = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest;
  const id = req.url.split("/").filter(Boolean).pop() ?? "";
  return yield* respond(getEvent(id));
});

const saveRoute = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest;
  const segments = req.url.split("/").filter(Boolean);
  // /api/events/:id/me -> segments[-2]
  const id = segments[segments.length - 2] ?? "";
  const body = yield* HttpServerRequest.schemaBodyJson(SaveResponseBody);
  return yield* respond(saveResponse(id, body));
}).pipe(
  Effect.catchTags({
    ParseError: () =>
      HttpServerResponse.json({ error: "bad_request" }, { status: 400 }),
    RequestError: () =>
      HttpServerResponse.json({ error: "bad_request" }, { status: 400 }),
  }),
);

export const router = HttpRouter.empty.pipe(
  HttpRouter.post("/api/events", createRoute),
  HttpRouter.get("/api/events/:id", getRoute),
  HttpRouter.put("/api/events/:id/me", saveRoute),
);

/* ---------------- worker fetch entrypoint ---------------- */

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    return Effect.runPromise(
      router.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(request),
        ),
        Effect.provide(layerFrom(env.Store)),
        Effect.scoped,
        Effect.map((res) => HttpServerResponse.toWeb(res)),
        Effect.catchAllDefect((defect) => {
          console.error(defect);
          return Effect.succeed(
            new Response(JSON.stringify({ error: "internal_error" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            }),
          );
        }),
      ),
    );
  },
};
