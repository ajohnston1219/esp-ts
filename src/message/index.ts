import { AggregateId, StreamName } from '../stream';
import * as uuid from 'uuid';
import { z } from 'zod';

export type Message<Tag extends string, Payload> = Payload extends undefined
    ? { readonly _tag: Tag }
    : { readonly _tag: Tag, payload: Payload }

export type MessageId = string;
export const generateMessageId = uuid.v4;
export type TraceId = string;
export const generateTraceId = uuid.v4;
export interface Envelope<M extends AnyMessage> {
    readonly traceId: TraceId;
    readonly streamName: StreamName;
    readonly message: M;
}
export type AnyMessage = Message<string, any>;
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

export interface MessageSchema<Tag extends string, Z extends Zod.ZodTypeAny> {
    readonly _tag: Tag;
    readonly schema: Z;
}
export type AnyMessageSchema = MessageSchema<string, Zod.ZodTypeAny>;
export type MessageTag<M extends AnyMessageSchema> = M['_tag'];
export type MessagePayload<M extends AnyMessageSchema> = z.infer<M['schema']>;
export type MessageType<M extends AnyMessageSchema> = Message<MessageTag<M>, MessagePayload<M>>;
export type MessageResult<M extends AnyMessage> = { aggregateId: AggregateId, traceId: TraceId } & M;
export type MessageCreatorNoId<M extends AnyMessageSchema> = MessagePayload<M> extends undefined
    ? () => MessageResult<MessageType<M>>
    : (payload: MessagePayload<M>) => MessageResult<MessageType<M>>;
export type MessageCreator<M extends AnyMessageSchema> = (traceId: TraceId) => (id: AggregateId) => MessageCreatorNoId<M>;

function createMessage<Schema extends AnyMessageSchema>(
    traceId: TraceId,
    aggregateId: AggregateId,
    tag: MessageTag<Schema>,
    payload: MessagePayload<Schema>,
): MessageResult<Schema> {
    const result: any = payload === undefined ? {
        traceId,
        aggregateId,
        _tag: tag,
    } : {
        traceId,
        aggregateId,
        _tag: tag,
        payload,
    }
    return result;
}
export type MessageHookFunction<M extends AnyMessage> = (message: M) => void;
export interface MessageHook<M extends AnyMessage> {
    after?: MessageHookFunction<M>[],
}
export function getMessageCreator<Schema extends AnyMessageSchema>(
    tag: MessageTag<Schema>,
    hooks?: MessageHook<MessageType<Schema>>,
): MessageCreator<Schema> {
    return (traceId: TraceId) => (id: AggregateId) => (payload?: MessagePayload<Schema>) => {
        const message: any = createMessage<Schema>(traceId, id, tag, payload);
        if (hooks?.after) {
            hooks.after.forEach(hook => hook(message));
        }
        return message;
    }
}