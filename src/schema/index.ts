import { KeysOfUnion } from "../utils/types";
import { Schema, z } from 'zod';

export type SchemaType = Zod.ZodTypeAny;

export type SchemaDefinition<N extends string, T extends SchemaType> = {
    readonly _tag: N;
    readonly schema: T;
}
export type TypeOfSchema<S extends AnySchemaDefinition> = z.infer<S['schema']>;
export type SchemaTag<S extends AnySchemaDefinition> = S['_tag'];
export type AnySchemaDefinition = SchemaDefinition<string, SchemaType>;
export type GetSchema<S extends AnySchemaDefinition, Tag extends SchemaTag<S>> = SchemaTag<S> extends Tag ? S : never;

export type SchemaMap<N extends string, S extends AnySchemaDefinition> = {
    readonly _tag: N;
    readonly schema: {
        [Tag in S['_tag']]: S extends { readonly _tag: Tag } ? S : never;
    }
}
export type AnySchemaMap = SchemaMap<string, AnySchemaDefinition>;

export type SchemaMapSchemas<M extends AnySchemaMap> = M['schema'][KeysOfUnion<M['schema']>];
export type GetSchemaFromMap<M extends AnySchemaMap, Tag extends KeysOfUnion<M['schema']>> = GetSchema<M['schema'][Tag], Tag>;

export const define = <T extends string, S extends SchemaType>(tag: T, schema: S): SchemaDefinition<T, S> => ({ _tag: tag, schema });

export const defineMap = <N extends string, D extends SchemaDefinition<Tags, z.ZodTypeAny>, Tags extends string>(
    name: N,
    schema: { [Tag in Tags]: D extends { readonly _tag: Tag } ? D : never },
): SchemaMap<N, D> => ({
    _tag: name,
    schema,
});