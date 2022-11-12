import { AnyMessage, AnyMessageSchema, Envelope, getMessageCreator, Message, MessageCreator, MessageHook, MessagePayload, MessageTag, MessageType, TraceId } from '../message';
import * as uuid from 'uuid';
import { KeysOfUnion } from '../utils/types';
import { Schema } from 'zod';

export type AggregateId = string;
export const generateId = uuid.v4;

export type Channel = {
    readonly service: string;
    readonly channel: string;
}
export type StreamName = {
    readonly id: AggregateId;
} & Channel;

export function streamEquals(a: StreamName, b: StreamName): boolean {
    return (
        channelEquals(a, b)
        && a.id === b.id
    );
}
export function channelEquals(a: Channel, b: Channel): boolean {
    return (
        a.service === b.service
        && a.channel === b.channel
    );
}

export function messageInChannel({ streamName }: Envelope<AnyMessage>, channel: Channel): boolean {
    return channelEquals(streamName, channel);
}

export function messageInStream({ streamName }: Envelope<AnyMessage>, _streamName: StreamName): boolean {
    return streamEquals(streamName, _streamName);
}

export interface ChannelSchema<N extends string, Schema extends AnyMessageSchema, S extends string = '__LOCAL__'> {
    readonly service: S;
    readonly name: N;
    readonly schemas: {
        [Tag in MessageTag<Schema>]: Schema;
    }
}
export type AnyChannelSchema = ChannelSchema<string, AnyMessageSchema, string>;
export type ChannelName<Schema extends AnyChannelSchema> = Schema['name'];
export type ChannelTags<Schema extends AnyChannelSchema> = KeysOfUnion<Schema['schemas']>;
export type ChannelSchemas<Schema extends AnyChannelSchema, T extends ChannelTags<Schema> = ChannelTags<Schema>> = Schema['schemas'][T];
export type ChannelPayloads<Schema extends AnyChannelSchema> = MessagePayload<Schema['schemas'][ChannelTags<Schema>]>;
export type ChannelPayload<Schema extends AnyChannelSchema, T extends ChannelTags<Schema>> = MessagePayload<Schema['schemas'][T]>;
export type ChannelMessage<Schema extends AnyChannelSchema, Tag extends ChannelTags<Schema>> = Message<Tag, ChannelPayload<Schema, Tag>>;
export type ChannelMessageCreators<Schema extends AnyChannelSchema> = {
    [Tag in ChannelTags<Schema>]: MessageCreator<ChannelSchemas<Schema, Tag>>;
}

export type MessageHooks<Schema extends AnyChannelSchema> = {
    [Tag in ChannelTags<Schema>]: MessageHook<MessageType<ChannelSchemas<Schema, Tag>>>;
}

export const getStreamName = <Schema extends AnyChannelSchema>(schema: Schema) => (id: string) => ({
    channel: schema.name,
    service: schema.service,
    id,
});
export function getMessageCreators<Schema extends AnyChannelSchema>(
    schema: Schema,
    hooks?: MessageHooks<Schema>,
): ChannelMessageCreators<Schema> {
    const getHooks = (schemaName: ChannelTags<Schema>) => {
        return hooks ? hooks[schemaName] : undefined;
    };
    const creators = Object.keys(schema.schemas).reduce<ChannelMessageCreators<Schema>>((acc, curr) => ({
        ...acc,
        [curr]: getMessageCreator(schema.schemas[curr]._tag, getStreamName(schema), getHooks(curr as any)),
    }), {} as any);
    return creators;
}
export function getMessageCreatorsNoId<Schema extends AnyChannelSchema>(
    traceId: TraceId,
    id: AggregateId,
    schema: Schema,
    hooks?: MessageHooks<Schema>,
): ChannelMessageCreators<Schema> {
    const getHooks = (schemaName: ChannelTags<Schema>) => {
        return hooks ? hooks[schemaName] : undefined;
    };
    const creators = Object.keys(schema.schemas).reduce<ChannelMessageCreators<Schema>>((acc, curr) => ({
        ...acc,
        [curr]: getMessageCreator(schema.schemas[curr]._tag, getStreamName(schema), getHooks(curr as any))(traceId)(id),
    }), {} as any);
    return creators;
}