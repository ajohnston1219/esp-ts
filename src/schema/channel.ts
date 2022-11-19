import { TypeOf, z } from "zod";
import { AnySchemaDefinition, define, defineSet, MessageSet, SomeSchemaDefinition, SomeTaggedSchema, TypeOfSchema } from ".";
import { AnyMessage, AnyMessageSchema, defineMessage, GetMessageType, Message, MessagePayload, MessageTag, MessageType, NoMessageSchema } from "../message";
import { KeysOfUnion } from "../utils/types";
import { TaggedMapFromArray } from "./tagged";

export type ChannelSchema<N extends string, M extends AnyMessageSchema, S extends string> = MessageSet<N, M> & { readonly service: S }
export type AnyChannelSchema = ChannelSchema<string, AnyMessageSchema, string>;

export const defineChannel = <N extends string, M extends [...AnyMessageSchema[]], S extends string>(
    service: S,
    name: N,
    ...messages: M
): ChannelSchema<N, M[number], S> => ({
    service,
    ...defineSet(name, ...messages),
});

export type IgnoreChannel = ChannelSchema<'__IGNORE__', NoMessageSchema, '__LOCAL__'>;
export const ignoreChannel = (): { '__IGNORE__': IgnoreChannel } => ({
    '__IGNORE__': {
        service: '__LOCAL__',
        name: '__IGNORE__',
        schemas: [
            defineMessage('__IGNORE__', z.undefined()),
        ],
    },
});

export type ChannelName<Schema extends AnyChannelSchema> = Schema['name'];
export type ChannelNames<Schema extends AnyChannelSchema> = Schema['name'];
export type ChannelSchemas<Schema extends AnyChannelSchema> = Schema['schemas'][number];
export type ChannelTags<Schema extends AnyChannelSchema> = MessageTag<ChannelSchemas<Schema>>;
export type ChannelPayloads<Schema extends AnyChannelSchema> = MessagePayload<ChannelSchemas<Schema>>;
export type ChannelMessages<Schema extends AnyChannelSchema> = {
    [M in Schema['schemas'][number] as M[0]]: MessageType<M>;
}
export type GetChannelMessage<Schema extends AnyChannelSchema, Tag extends Schema['schemas'][number][0]> =
    ChannelMessages<Schema>[Tag];

const one = defineMessage('One', z.number());
const two = defineMessage('Two', z.string());
const channel = defineChannel('my-service', 'my-channel', one, two);

type CN = ChannelNames<typeof channel>;
type CS = ChannelSchemas<typeof channel>;
type CT = ChannelTags<typeof channel>;
type CP = ChannelPayloads<typeof channel>;
type CMS = ChannelMessages<typeof channel>;
type CM = GetChannelMessage<typeof channel, 'One' | 'Two'>;
