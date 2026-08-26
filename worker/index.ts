import { Context, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { MeetingsApi } from "@/domain";
import { EventsApiHandlers } from "./handlers";
import { layerFrom } from "./kv";

type Bindings = {
  Store: KVNamespace;
  ASSETS: Fetcher;
};

// Cache web handler instances per KV binding
const handlers = new WeakMap<
  KVNamespace,
  (request: Request) => Promise<Response>
>();

function getHandler(store: KVNamespace): (request: Request) => Promise<Response> {
  let h = handlers.get(store);
  if (!h) {
    const handlersLive = EventsApiHandlers.pipe(Layer.provide(layerFrom(store)));
    const apiLayer = HttpApiBuilder.layer(MeetingsApi, {
      openapiPath: "/api/openapi.json",
    }).pipe(
      Layer.provide(handlersLive),
      Layer.provide(HttpServer.layerServices),
    );
    const { handler } = HttpRouter.toWebHandler(apiLayer);
    h = (req: Request) => handler(req, Context.empty() as never);
    handlers.set(store, h);
  }
  return h;
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const url = new URL(request.url);

    // API routes handled by Effect HttpApi
    if (url.pathname.startsWith("/api/")) {
      const handler = getHandler(env.Store);
      return handler(request);
    }

    // Static assets (SPA) handled by Cloudflare ASSETS
    return env.ASSETS.fetch(request);
  },
};
