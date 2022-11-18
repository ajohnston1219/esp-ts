import { z } from "zod";
import { AnySchemaDefinition, define, defineMap, SchemaMap, SchemaMapTags, TypeOfSchema } from ".";
import { AnyMessage, AnyMessageSchema, GetMessageType, Message, MessageTypes, NoMessageSchema } from "../message";

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

export type ChannelMessageSchemas<Schema extends AnySchemaDefinition> = {
    readonly [S in Schema as S['_tag']]: S;
}
export type GetChannelMessageSchema<Schema extends AnyChannelSchema, Tag extends ChannelTags<Schema>> =
    ChannelMessageSchemas<Schema['schema'][Tag]>[Tag];

export type ChannelMessageTypes<Schema extends AnySchemaDefinition> = {
    readonly [S in Schema as S['_tag']]: Message<S['_tag'], TypeOfSchema<S>>;
}
export type GetChannelMessageType<Schema extends AnyChannelSchema, Tag extends ChannelTags<Schema>> =
    ChannelMessageTypes<Schema['schema'][Tag]>[Tag];

const one = define('One', z.number());
const two = define('Two', z.string());
const channel = defineChannel('my-service', 'my-channel', one, two);

type MT = MessageTypes<typeof one | typeof two>;
type OT = GetMessageType<typeof one | typeof two, 'One'>;
type IS = OT extends AnyMessage ? true : false;

