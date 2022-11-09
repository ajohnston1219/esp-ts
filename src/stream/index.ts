import { AnyMessage, AnyMessageSchema, Envelope, getMessageCreator, Message, MessageCreator, MessagePayload, MessageTag } from '../message';
import * as uuid from 'uuid';

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

export interface ChannelSchema<N extends string, Schema extends AnyMessageSchema> {
    readonly name: N;
    readonly schemas: {
        [Tag in MessageTag<Schema>]: Schema;
    }
}
export type AnyChannelSchema = ChannelSchema<string, AnyMessageSchema>;
export type ChannelName<Schema extends AnyChannelSchema> = Schema['name'];
export type ChannelTags<Schema extends AnyChannelSchema> = keyof Schema['schemas'];
export type ChannelSchemas<Schema extends AnyChannelSchema, T extends ChannelTags<Schema> = ChannelTags<Schema>> = Schema['schemas'][T];
export type ChannelPayloads<Schema extends AnyChannelSchema> = MessagePayload<Schema['schemas'][string]>;
export type ChannelMessageCreators<Schema extends AnyChannelSchema> = {
    [Tag in ChannelTags<Schema>]: MessageCreator<ChannelSchemas<Schema, Tag>>;
}

export function getMessageCreators<Schema extends AnyChannelSchema>(schema: Schema) {
    return Object.keys(schema.schemas).reduce<ChannelMessageCreators<Schema>>((acc, curr) => {
        return {
            ...acc,
            [curr]: getMessageCreator<MessagePayload<typeof schema.schemas[string]>>(curr)
        }
    }, {} as any);
}