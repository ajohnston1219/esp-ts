import { AnyMessage, AnyMessageSchema, Envelope, getMessageCreator, Message, MessageCreator, MessageCreatorNoId, MessageCreatorNoTraceId, MessageHook, MessagePayload, NoMessageSchema, TraceId } from '../message';
import { z } from 'zod';
import * as uuid from 'uuid';
import { KeysOfUnion } from '../utils/types';
import { define, defineMap, SchemaMap } from '../schema';
import { AnyChannelSchema, ChannelMessageType, ChannelTags } from '../schema/channel';

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

export type ChannelMessageCreators<Schema extends AnyChannelSchema, Tags extends ChannelTags<Schema> = ChannelTags<Schema>> = {
    [Tag in Tags]: MessageCreator<ChannelMessageType<Schema, Tag>>;
}
export type ChannelMessageCreatorsNoTraceId<Schema extends AnyChannelSchema, Tags extends ChannelTags<Schema> = ChannelTags<Schema>> = {
    [Tag in Tags]: MessageCreatorNoTraceId<ChannelMessageType<Schema, Tag>>;
}
export type ChannelMessageCreatorsNoId<Schema extends AnyChannelSchema, Tags extends ChannelTags<Schema> = ChannelTags<Schema>> = {
    [Tag in Tags]: MessageCreatorNoId<ChannelMessageType<Schema, Tag>>;
}

export type MessageHooks<Schema extends AnyChannelSchema, Tags extends ChannelTags<Schema> = ChannelTags<Schema>> = {
    [Tag in Tags]: MessageHook<ChannelMessageType<Schema, Tag>>;
}
export const getStreamName = <Schema extends AnyChannelSchema>(schema: Schema) => (id: string) => ({
    channel: schema._tag,
    service: schema.service,
    id,
});

export function getMessageCreators<Schema extends AnyChannelSchema>(
    schema: Schema,
    hooks?: MessageHooks<Schema>,
): ChannelMessageCreators<Schema> {
    const getHooks: any = (schemaName: ChannelTags<Schema>) => {
        return hooks ? hooks[schemaName] : undefined;
    };
    const creators = Object.keys(schema.schema).reduce<ChannelMessageCreators<Schema>>((acc, curr: any) => ({
        ...acc,
        [curr]: getMessageCreator(schema.schema[curr]._tag as unknown as ChannelTags<Schema>, getStreamName(schema), getHooks(curr) as any),
    }) as any, {} as any);
    return creators;
}
export function getMessageCreatorsNoId<Schema extends AnyChannelSchema>(
    traceId: TraceId,
    id: AggregateId,
    schema: Schema,
    hooks?: MessageHooks<Schema>,
): ChannelMessageCreators<Schema> {
    const getHooks: any = (schemaName: ChannelTags<Schema>) => {
        return hooks ? hooks[schemaName] : undefined;
    };
    const creators = Object.keys(schema.schema).reduce<ChannelMessageCreators<Schema>>((acc, curr: any) => ({
        ...acc,
        [curr]: getMessageCreator(schema.schema[curr]._tag as unknown as ChannelTags<Schema>, getStreamName(schema), getHooks(curr))(traceId)(id),
    }) as any, {} as any);
    return creators;
}