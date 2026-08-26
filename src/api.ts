export type MarkState = "free" | "no";

export interface EventData {
  id: string;
  title: string;
  days: string[];
  responses: { pid: string; name: string; marks: Record<string, MarkState> }[];
}

export async function createEvent(title: string, start: string, end: string) {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, start, end }),
  });
  if (!res.ok) throw new Error("create failed");
  return (await res.json()) as { id: string };
}

export async function getEvent(id: string) {
  const res = await fetch(`/api/events/${id}`);
  if (!res.ok) throw new Error("not found");
  return (await res.json()) as EventData;
}

export async function saveMe(
  id: string,
  body: { pid: string | null; name: string; marks: Record<string, MarkState> },
) {
  const res = await fetch(`/api/events/${id}/me`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("save failed");
  return (await res.json()) as { pid: string };
}
