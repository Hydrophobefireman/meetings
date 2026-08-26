import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi,
} from "effect/unstable/httpapi";

/* ---------------- Errors ---------------- */

export class BadRequest extends Schema.TaggedError<BadRequest>()("BadRequest", {
  error: Schema.optionalKey(Schema.String),
}) {}

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  error: Schema.optionalKey(Schema.String),
}) {}

/* ---------------- Domain Models ---------------- */

export const MarkState = Schema.Literals(["free", "no"]);
export type MarkState = typeof MarkState.Type;

export class ResponseRec extends Schema.Class<ResponseRec>("ResponseRec")({
  pid: Schema.String,
  name: Schema.String,
  marks: Schema.Record(Schema.String, MarkState),
  at: Schema.Number,
}) {}

export class EventData extends Schema.Class<EventData>("EventData")({
  id: Schema.String,
  title: Schema.String,
  days: Schema.Array(Schema.String),
  responses: Schema.Array(ResponseRec),
}) {}

export class CreateEventPayload extends Schema.Class<CreateEventPayload>(
  "CreateEventPayload",
)({
  title: Schema.String,
  start: Schema.optionalKey(Schema.String),
  end: Schema.optionalKey(Schema.String),
  days: Schema.optionalKey(Schema.Array(Schema.String)),
}) {}

export class CreateEventResponse extends Schema.Class<CreateEventResponse>(
  "CreateEventResponse",
)({
  id: Schema.String,
}) {}

export class SaveResponsePayload extends Schema.Class<SaveResponsePayload>(
  "SaveResponsePayload",
)({
  pid: Schema.optionalKey(Schema.String),
  name: Schema.String,
  marks: Schema.Record(Schema.String, MarkState),
}) {}

export class SaveResponseResponse extends Schema.Class<SaveResponseResponse>(
  "SaveResponseResponse",
)({
  pid: Schema.String,
}) {}

/* ---------------- API Contract ---------------- */

export class EventsGroup extends HttpApiGroup.make("events")
  .add(
    HttpApiEndpoint.post("create", "/events", {
      payload: CreateEventPayload,
      success: CreateEventResponse,
      error: BadRequest.pipe(HttpApiSchema.status(400)),
    }),
    HttpApiEndpoint.get("getById", "/events/:id", {
      params: { id: Schema.String },
      success: EventData,
      error: NotFound.pipe(HttpApiSchema.status(404)),
    }),
    HttpApiEndpoint.put("saveMe", "/events/:id/me", {
      params: { id: Schema.String },
      payload: SaveResponsePayload,
      success: SaveResponseResponse,
      error: [
        BadRequest.pipe(HttpApiSchema.status(400)),
        NotFound.pipe(HttpApiSchema.status(404)),
      ],
    }),
  )
  .prefix("/api")
  .annotateMerge(
    OpenApi.annotations({
      title: "Events",
      description: "Availability polling and event management",
    }),
  ) {}

export class MeetingsApi extends HttpApi.make("meetings")
  .add(EventsGroup)
  .annotateMerge(
    OpenApi.annotations({
      title: "meetings.",
      description: "Group scheduling API",
    }),
  ) {}
