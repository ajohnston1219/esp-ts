import { AggregateId, StreamName } from '../stream';
import * as uuid from 'uuid';
import { z } from 'zod';
import { SchemaDefinition, SchemaMap, SchemaTag, SchemaType, TypeOfSchema } from '../schema';

export type Message<Tag extends string, Payload> = { readonly _tag: Tag, payload: Payload }
export type AnyMessage = Message<string, any>;

export type MessageId = string;
export const generateMessageId = uuid.v4;
export type TraceId = string;
export const generateTraceId = uuid.v4;
export interface Envelope<M extends AnyMessage> {
    readonly traceId: TraceId;
    readonly streamName: StreamName;
    readonly message: M;
}

export interface OutgoingMessage<M extends AnyMessage> extends Envelope<M> {
}
export interface IncomingMessage<M extends AnyMessage> extends Envelope<M> {
    readonly id: MessageId;
    readonly version: number;
}
export interface StoredMessage<M extends AnyMessage> extends IncomingMessage<M> {
    readonly depth: number;
    readonly channelVersion: number;
}

export type MessageSchema<T extends string, S extends SchemaType> = SchemaDefinition<T, S>;
export type AnyMessageSchema = MessageSchema<string, SchemaType>;
export type MessageSchemaMap<N extends string, M extends AnyMessageSchema> = SchemaMap<N, M>;
export type NoMessageSchema = MessageSchema<'__IGNORE__', z.ZodUndefined>;

export type MessageTag<M extends AnyMessageSchema> = SchemaTag<M>;
export type MessagePayload<M extends AnyMessageSchema> = TypeOfSchema<M>;
export type MessageType<M extends AnyMessageSchema> = {
    [Tag in MessageTag<M>]: M extends z.ZodObject<{ readonly _tag: z.ZodLiteral<Tag> }>
        ? Message<MessageTag<M>, MessagePayload<M>>
        : never;
}[MessageTag<M>];

export type MessageResult<M extends AnyMessage> = { aggregateId: AggregateId, traceId: TraceId, streamName: StreamName } & M;
export type MessageCreatorNoId<M extends AnyMessage> = M['payload'] extends undefined | void
    ? () => MessageResult<M>
    : (payload: M['payload']) => MessageResult<M>;
export type MessageCreatorNoTraceId<M extends AnyMessage> = (id: AggregateId) => MessageCreatorNoId<M>;
export type MessageCreator<M extends AnyMessage> = (traceId: TraceId) => MessageCreatorNoTraceId<M>;

function createMessage<Schema extends AnyMessageSchema>(
    traceId: TraceId,
    aggregateId: AggregateId,
    streamName: StreamName,
    tag: MessageTag<Schema>,
    payload: MessagePayload<Schema>,
): MessageResult<Message<MessageTag<Schema>, MessagePayload<Schema>>> {
    const result: any = payload === undefined ? {
        traceId,
        aggregateId,
        streamName,
        _tag: tag,
    } : {
        traceId,
        aggregateId,
        _tag: tag,
        streamName,
        payload,
    }
    return result;
}
export type MessageHookFunction<M extends AnyMessage> = (message: M) => void;
export interface MessageHook<M extends AnyMessage> {
    after?: MessageHookFunction<M>[],
}
export function getMessageCreator<T extends MessageTag<Schema>, Schema extends AnyMessageSchema>(
    tag: T,
    streamName: (id: AggregateId) => StreamName,
    hooks?: MessageHook<Message<T, Schema>>,
): MessageCreator<MessageType<Schema>> {
    return (traceId: TraceId) => (id: AggregateId) => (payload?: MessagePayload<Schema>) => {
        const message: any = createMessage<Schema>(traceId, id, streamName(id), tag, payload);
        if (hooks?.after) {
            hooks.after.forEach(hook => hook(message));
        }
        return message;
    }
}