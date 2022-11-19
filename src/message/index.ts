import { AggregateId, StreamName } from '../stream';
import * as uuid from 'uuid';
import { z } from 'zod';
import { defineSchema, SchemaDefinition, SchemaTag, SchemaType, TypeOfSchema } from '../schema';
import { GetObject, IsTagged } from '../schema/tagged';

export type Message<Tag extends string, Payload> = { readonly _tag: Tag, payload: Payload }
export type SomeMessage<Tag extends string> = Message<Tag, any>;
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

type MessageSchemaWithTag<T extends string, S extends SchemaType> = z.ZodObject<{
    readonly _tag: z.ZodLiteral<T>;
    readonly payload: S;
}>
export type MessageSchema<T extends string, S extends SchemaType> = SchemaDefinition<T, MessageSchemaWithTag<T, S>>;
export type SomeMessageSchema<T extends string> = MessageSchema<T, SchemaType>;
export type AnyMessageSchema = MessageSchema<string, SchemaType>;
export type NoMessageSchema = MessageSchema<'__IGNORE__', z.ZodUndefined>;

export type MessageType<M extends AnyMessageSchema> = Message<GetObject<M>['_output']['_tag'], GetObject<M>['_output']['payload']>;
export type GetMessageType<M extends AnyMessageSchema, Tag extends MessageTag<M>> =
    IsTagged<M, Tag> extends true
        ? Message<GetObject<M>['_output']['_tag'], GetObject<M>['_output']['payload']>
        : never;
export type MessageTag<M extends AnyMessageSchema> = MessageType<M>['_tag'];
export type MessagePayload<M extends AnyMessageSchema> = MessageType<M>['payload'];

export type MessageResult<M extends AnyMessage> = Envelope<M>;
export type MessageCreatorNoId<M extends AnyMessage> = M['payload'] extends undefined | void
    ? () => MessageResult<M>
    : (payload: M['payload']) => MessageResult<M>;
export type MessageCreatorNoTraceId<M extends AnyMessage> = (id: AggregateId) => MessageCreatorNoId<M>;
export type MessageCreator<M extends AnyMessage> = (traceId: TraceId) => MessageCreatorNoTraceId<M>;

export const defineMessage = <Tag extends string, S extends SchemaType>(tag: Tag, schema: S) =>
    defineSchema(tag, z.object({ _tag: z.literal(tag), payload: schema }));

function createMessage<Schema extends AnyMessageSchema>(
    traceId: TraceId,
    streamName: StreamName,
    tag: MessageTag<Schema>,
    payload: MessagePayload<Schema>,
): MessageResult<MessageType<Schema>> {
    const result: any = payload === undefined ? {
        traceId,
        streamName,
        message: { _tag: tag },
    } : {
        traceId,
        _tag: tag,
        streamName,
        message: { _tag: tag, payload },
    }
    return result;
}
export type MessageHookFunction<M extends AnyMessage> = (message: MessageResult<M>) => void;
export interface MessageHook<M extends AnyMessage> {
    after?: MessageHookFunction<M>[],
}
export function getMessageCreator<Schema extends AnyMessageSchema>(
    tag: MessageTag<Schema>,
    streamName: (id: AggregateId) => StreamName,
    hooks?: MessageHook<MessageType<Schema>>,
): MessageCreator<MessageType<Schema>> {
    return (traceId: TraceId) => (id: AggregateId) => (payload?: MessagePayload<Schema>) => {
        const message = createMessage<Schema>(traceId, streamName(id), tag, payload);
        if (hooks?.after) {
            hooks.after.forEach(hook => hook(message));
        }
        return message;
    };
}