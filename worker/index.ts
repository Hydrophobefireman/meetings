import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { Effect } from "effect";
import { KV } from "./kv";
import { BadRequest, createEvent, getEvent, Internal, NotFound, saveResponse } from "./ops";
import { layerFrom } from "./kv";

type Bindings = {
  Store: KVNamespace;
  ASSETS: Fetcher;
};

type C = Context<{ Bindings: Bindings }>;

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Runs an Effect with the KV layer for this request and maps typed
 * errors onto HTTP responses.
 */
function handle<T>(
  c: C,
  eff: Effect.Effect<T, BadRequest | NotFound | Internal, KV>,
  status: ContentfulStatusCode = 200,
): Promise<Response> {
  return Effect.runPromise(
    Effect.provide(Effect.either(eff), layerFrom(c.env.Store)),
  ).then(
    (result) => {
      if (result._tag === "Right") return c.json(result.right, status);
      const err = result.left;
      if (err._tag === "BadRequest") return c.json({ error: "bad_request" }, 400);
      if (err._tag === "NotFound") return c.json({ error: "not_found" }, 404);
      console.error(err);
      return c.json({ error: "internal_error" }, 500);
    },
    (err) => {
      // defects (unexpected throws inside the Effect)
      console.error(err);
      return c.json({ error: "internal_error" }, 500);
    },
  );
}

app.post("/api/events", (c) =>
  c.req
    .json<unknown>()
    .catch(() => undefined)
    .then((body) => handle(c, createEvent(body), 201)),
);

app.get("/api/events/:id", (c) => handle(c, getEvent(c.req.param("id"))));

app.put("/api/events/:id/me", (c) =>
  c.req
    .json<unknown>()
    .catch(() => undefined)
    .then((body) => handle(c, saveResponse(c.req.param("id"), body))),
);

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
