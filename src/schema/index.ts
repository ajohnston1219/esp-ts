import { KeysOfUnion } from "../utils/types";
import { TypeOf, z } from 'zod';

export type SchemaType = Zod.ZodTypeAny;

export type SchemaDefinition<N extends string, T extends SchemaType> = z.ZodObject<{
    readonly _tag: z.ZodLiteral<N>;
    readonly schema: T;
}>;
export type AnySchemaDefinition = SchemaDefinition<string, SchemaType>;
export type TypeOfSchema<S extends AnySchemaDefinition> = z.infer<S>['schema'];
export type TypeOfDefinition<S extends AnySchemaDefinition> = z.infer<S>;
export type SchemaTag<S extends AnySchemaDefinition> = z.infer<S>['_tag'];
export type GetTaggedObject<TO extends { readonly _tag: string }, Tag extends string> = TO extends { readonly _tag: Tag } ? TO : never;
export type GetSchema<S extends AnySchemaDefinition, Tag extends SchemaTag<S>> =
    S extends z.ZodObject<{ readonly _tag: z.ZodLiteral<Tag> }> ? S : never;

export type SchemaMap<N extends string, S extends AnySchemaDefinition> = {
    readonly _tag: N;
    readonly schema: {
        [Tag in SchemaTag<S>]: GetSchema<S, Tag>
    }
}
export type AnySchemaMap = SchemaMap<string, AnySchemaDefinition>;

export type SchemaMapSchemas<M extends AnySchemaMap> = M['schema'][KeysOfUnion<M['schema']>];
export type SchemaMapTags<M extends AnySchemaMap> = M['schema'][KeysOfUnion<M['schema']>]['_output']['_tag'];
export type GetSchemaFromMap<M extends AnySchemaMap, Tag extends SchemaTag<M['schema'][KeysOfUnion<M['schema']>]>> =
    GetSchema<M['schema'][Tag], Tag>;

export type FunctionSchemaType<In extends z.ZodTuple, Out extends SchemaType> = z.ZodFunction<In, Out>;
export type AsyncFunctionSchemaType<In extends z.ZodTuple, Out extends SchemaType> = z.ZodFunction<In, z.ZodPromise<Out>>;

export const define = <T extends string, S extends SchemaType>(tag: T, schema: S): SchemaDefinition<T, S> =>
    z.object({ _tag: z.literal(tag), schema });

export const defineMap = <N extends string, D extends SchemaDefinition<string, z.ZodTypeAny>>(
    name: N,
    schema: { [Tag in SchemaTag<D>]: GetSchema<D, Tag> },
): SchemaMap<N, D> => ({
    _tag: name,
    schema: schema as any,
});