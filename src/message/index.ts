import { StreamName } from '../stream';
import * as uuid from 'uuid';
import { z } from 'zod';

export type Message<Tag extends string, Payload = any> = { readonly _tag: Tag } & Payload;

export type TraceId = string;
export const generateTraceId = uuid.v4;
export interface Envelope<M extends Message<string>> {
    readonly traceId: TraceId;
    readonly streamName: StreamName;
    readonly message: M;
}
export type AnyMessage = Message<string>;
export interface OutgoingMessage<M extends AnyMessage> extends Envelope<M> {
}
export interface IncomingMessage<M extends AnyMessage> extends Envelope<M> {
    readonly id: string;
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
export type MessagePayload<M extends AnyMessageSchema> = z.infer<M['schema']>
export type MessageType<M extends AnyMessageSchema> = Message<MessageTag<M>, MessagePayload<M>>;
export type MessageCreator<M extends AnyMessageSchema> = MessagePayload<M> extends undefined
    ? () => MessageType<M>
    : (payload: MessagePayload<M>) => MessageType<M>;
function createMessage<Schema extends AnyMessageSchema>(
    tag: MessageTag<Schema>,
    payload: MessagePayload<Schema>,
): MessageType<Schema> {
    const message: Message<MessageTag<Schema>, typeof payload> = {
        _tag: tag,
        ...payload,
    }
    return message;
}
export function getMessageCreator<Schema extends AnyMessageSchema>(
    tag: MessageTag<Schema>,
): MessageCreator<Schema> {
    return function(payload?: MessagePayload<Schema>) {
        return createMessage<Schema>(tag, payload);
    }
}