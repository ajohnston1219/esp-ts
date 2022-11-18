import { KeysOfUnion } from "../utils/types";
import { z } from 'zod';
import { GetTaggedObject, IsTagged } from "./tagged";

export type SchemaType = Zod.ZodTypeAny;

export type SchemaDefinition<N extends string, T extends SchemaType> = {
    readonly _tag: N;
    readonly schema: T;
};
export type AnySchemaDefinition = SchemaDefinition<string, SchemaType>;
export type TypeOfSchema<S extends AnySchemaDefinition> = z.infer<S['schema']>;
export type TypeOfDefinition<S extends AnySchemaDefinition> = z.infer<S['schema']>;
export type SchemaTag<S extends AnySchemaDefinition> = S['_tag'];
export type GetSchema<S extends AnySchemaDefinition, Tag extends SchemaTag<S>> = GetTaggedObject<S, Tag>;
export type GetSchemaType<S extends AnySchemaDefinition, Tag extends SchemaTag<S>> = TypeOfSchema<GetTaggedObject<S, Tag>>;

export type SchemaMap<N extends string, Schema extends AnySchemaDefinition> = {
    readonly _tag: N;
    readonly schema: {
        [S in Schema as S['_tag']]: S;
    }
}
export type AnySchemaMap = SchemaMap<string, AnySchemaDefinition>;

type SchemaMapSchema<M extends AnySchemaMap> = M['schema'][KeysOfUnion<M['schema']>];
export type SchemaMapTags<M extends AnySchemaMap> = SchemaMapSchema<M>['_tag'];
export type SchemaMapSchemas<M extends AnySchemaMap, Tag extends SchemaMapTags<M>> = {
    [S in M['schema'] as M['schema'][SchemaMapTags<M>]['_tag']]: S;
}
export type GetSchemaFromMap<M extends AnySchemaMap, Tag extends SchemaMapTags<M>> = SchemaMapSchemas<M, SchemaMapTags<M>>[Tag];

export type FunctionSchemaType<In extends z.ZodTuple, Out extends SchemaType> = z.ZodFunction<In, Out>;
export type AsyncFunctionSchemaType<In extends z.ZodTuple, Out extends SchemaType> = z.ZodFunction<In, z.ZodPromise<Out>>;

export const define = <T extends string, S extends SchemaType>(tag: T, schema: S): SchemaDefinition<T, S> => ({ _tag: tag, schema });

export const defineMap = <N extends string, D extends SchemaDefinition<string, z.ZodTypeAny>>(
    name: N,
    schema: SchemaMap<N, D>['schema'],
): SchemaMap<N, D> => ({
    _tag: name,
    schema,
});