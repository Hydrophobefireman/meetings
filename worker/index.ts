import { Hono } from "hono";
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

type Bindings = {
  Store: KVNamespace;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

const eventKey = (id: string) => `event:${id}`;
const respKey = (id: string, pid: string) => `resp:${id}:${pid}`;
const indexKey = (id: string) => `resp-index:${id}`;

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

app.post("/api/events", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "bad_request" }, 400);

  const title = cleanTitle(body.title);
  // accepts { start, end } range or a legacy days array
  const days = normalizeDays(body.days ?? body);
  if (!title || !days) return c.json({ error: "bad_request" }, 400);

  let id = rid(7);
  for (let i = 0; i < 3; i++) {
    if (!(await c.env.Store.get(eventKey(id)))) break;
    id = rid(7);
  }

  const meta: EventMeta = { id, title, days, created: Date.now() };
  await c.env.Store.put(eventKey(id), JSON.stringify(meta));
  return c.json({ id }, 201);
});

app.get("/api/events/:id", async (c) => {
  const id = c.req.param("id");
  const meta = await c.env.Store.get<EventMeta>(eventKey(id), "json");
  if (!meta) return c.json({ error: "not_found" }, 404);

  const index = (await c.env.Store.get<string[]>(indexKey(id), "json")) ?? [];
  const responses = (
    await Promise.all(
      index.map((pid) => c.env.Store.get<ResponseRec>(respKey(id, pid), "json")),
    )
  ).filter((r): r is ResponseRec => r !== null);
  responses.sort((a, b) => a.at - b.at);

  return c.json({
    id: meta.id,
    title: meta.title,
    days: meta.days,
    responses,
  });
});

app.put("/api/events/:id/me", async (c) => {
  const id = c.req.param("id");
  const meta = await c.env.Store.get<EventMeta>(eventKey(id), "json");
  if (!meta) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const name = body ? cleanName(body.name) : null;
  if (!body || !name) return c.json({ error: "bad_request" }, 400);

  const pid = validPid(body.pid) ?? rid(12);
  const key = respKey(id, pid);
  const prev = body.pid ? await c.env.Store.get<ResponseRec>(key, "json") : null;

  const rec: ResponseRec = {
    pid,
    name,
    marks: normalizeMarks(meta, body.marks),
    at: prev?.at ?? Date.now(),
  };
  await c.env.Store.put(key, JSON.stringify(rec));

  const index = new Set(
    (await c.env.Store.get<string[]>(indexKey(id), "json")) ?? [],
  );
  if (!index.has(pid)) {
    index.add(pid);
    await c.env.Store.put(indexKey(id), JSON.stringify([...index]));
  }

  return c.json({ pid });
});

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
