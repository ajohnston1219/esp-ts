import { Schema, TypeOf, z } from "zod";
import { AnySchemaDefinition, define, defineMap, GetSchemaFromMap, GetSchemaType, SchemaMap, SchemaMapSchemas, SchemaMapTags, SchemaType, TypeOfSchema } from ".";
import { AnyMessage, AnyMessageSchema, Message, MessagePayload, NoMessageSchema } from "../message";
import { KeysOfUnion } from "../utils/types";
import { GetTaggedObject, IsTagged } from "./tagged";

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
        [curr._tag]: curr,
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

export type ChannelNames<Schema extends AnyChannelSchema> = Schema['_tag'];
export type ChannelTags<Schema extends AnyChannelSchema> = SchemaMapTags<Schema>;

type ChannelMessageSchemas<Schema extends AnySchemaDefinition> = {
    [S in Schema as S['_tag']]: S;
}
export type GetChannelMessageSchema<Schema extends AnyChannelSchema, Tag extends ChannelTags<Schema>> =
    ChannelMessageSchemas<Schema['schema'][Tag]>[Tag];

type ChannelMessageTypes<Schema extends AnySchemaDefinition> = {
    [S in Schema as S['_tag']]: Message<S['_tag'], TypeOfSchema<S>>;
}
export type GetChannelMessageType<Schema extends AnyChannelSchema, Tag extends ChannelTags<Schema>> =
    ChannelMessageTypes<Schema['schema'][Tag]>[Tag];

const channel = defineChannel('my-service', 'my-channel',
    define('One', z.number()),
    define('Two', z.string()),
)

type C = typeof channel;
type S = typeof channel.schema;
type SS = C['schema'];
type N = ChannelNames<C>;
type T = ChannelTags<C>;
type MS = GetChannelMessageSchema<C, 'One' | 'Two'>;
type MT = GetChannelMessageType<C, 'One' | 'Two'>;