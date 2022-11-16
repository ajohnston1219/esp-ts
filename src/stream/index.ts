import { AnyMessage, AnyMessageSchema, Envelope, getMessageCreator, Message, MessageCreator, MessageCreatorNoId, MessageCreatorNoTraceId, MessageHook, MessagePayload, NoMessageSchema, TraceId } from '../message';
import { z } from 'zod';
import * as uuid from 'uuid';
import { KeysOfUnion } from '../utils/types';
import { define, defineMap, SchemaMap } from '../schema';

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

export type ChannelSchema<N extends string, M extends AnyMessageSchema, S extends string> =
    SchemaMap<N, M> & { readonly service: S };
export type AnyChannelSchema = ChannelSchema<string, AnyMessageSchema, string>;

export const defineChannel = <N extends string, M extends AnyMessageSchema[], S extends string>(
    service: S,
    name: N,
    ...schemas: M
): ChannelSchema<N, M[number], S> => ({
    service,
    ...defineMap<N, M[number]>(name, schemas.reduce((acc, curr) => ({
        ...acc,
        [curr.shape._tag.value]: curr,
    }), {} as any)),
});

export type IgnoreChannel = ChannelSchema<'__IGNORE__', NoMessageSchema, '__LOCAL__'>;
export const ignoreChannel = (): { '__IGNORE__': IgnoreChannel } => ({
    '__IGNORE__': {
        _tag: '__IGNORE__',
        service: '__LOCAL__',
        schema: {
            '__IGNORE__': define('__IGNORE__', z.undefined()),
        },
    },
});

export type ChannelName<Schema extends AnyChannelSchema> = Schema['_tag'];
export type ChannelTags<Schema extends AnyChannelSchema> = KeysOfUnion<Schema['schema']>;
export type ChannelMessageType<Schema extends AnyChannelSchema, Tag extends ChannelTags<Schema>> = Message<Tag, MessagePayload<Schema['schema'][Tag]>>;
export type ChannelMessageSchema<Schema extends AnyChannelSchema, Tag extends ChannelTags<Schema>> = Schema['schema'][Tag];
export type ChannelMessageCreators<Schema extends AnyChannelSchema> = {
    [Tag in ChannelTags<Schema>]: MessageCreator<ChannelMessageType<Schema, Tag>>;
}
export type ChannelMessageCreatorsNoTraceId<Schema extends AnyChannelSchema> = {
    [Tag in ChannelTags<Schema>]: MessageCreatorNoTraceId<ChannelMessageType<Schema, Tag>>;
}
export type ChannelMessageCreatorsNoId<Schema extends AnyChannelSchema> = {
    [Tag in ChannelTags<Schema>]: MessageCreatorNoId<ChannelMessageType<Schema, Tag>>;
}

export type MessageHooks<Schema extends AnyChannelSchema> = {
    [Tag in ChannelTags<Schema>]: MessageHook<ChannelMessageType<Schema, Tag>>;
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
        [curr]: getMessageCreator(schema.schema[curr].shape._tag.value as unknown as ChannelTags<Schema>, getStreamName(schema), getHooks(curr) as any),
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
        [curr]: getMessageCreator(schema.schema[curr].shape._tag.value as unknown as ChannelTags<Schema>, getStreamName(schema), getHooks(curr))(traceId)(id),
    }) as any, {} as any);
    return creators;
}