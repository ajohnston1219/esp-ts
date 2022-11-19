import { z } from 'zod';
import { GetTaggedObject, SomeTaggedObject, TaggedArray, TaggedObject } from "./tagged";

export type SchemaType = Zod.ZodTypeAny;

export type SchemaDefinition<N extends string, T extends SchemaType> = TaggedObject<N, T>;
export type SomeSchemaDefinition<T extends SchemaType> = SomeTaggedObject<T>;
export type SomeTaggedSchema<Tag extends string> = TaggedObject<Tag, any>;
export type AnySchemaDefinition = SchemaDefinition<string, SchemaType>;
export type TypeOfSchema<S extends AnySchemaDefinition> = z.infer<S[1]>;
export type SchemaTag<S extends AnySchemaDefinition> = S[0];
export type GetSchema<S extends AnySchemaDefinition, Tag extends SchemaTag<S>> = GetTaggedObject<S, Tag>;
export type GetSchemaType<S extends AnySchemaDefinition, Tag extends SchemaTag<S>> = TypeOfSchema<GetTaggedObject<S, Tag>>;

export type FunctionSchemaType<In extends z.ZodTuple, Out extends SchemaType> = z.ZodFunction<In, Out>;
export type AsyncFunctionSchemaType<In extends z.ZodTuple, Out extends SchemaType> = z.ZodFunction<In, z.ZodPromise<Out>>;

export const define = <Tag extends string, T>(tag: Tag, payload: T): TaggedObject<Tag, T> => [ tag, payload ];
export const defineSchema = <T extends string, S extends SchemaType>(tag: T, schema: S) => define(tag, schema);

export type MessageSet<N extends string, D extends AnySchemaDefinition> = {
    readonly name: N;
    schemas: TaggedArray<D>;
};
export const defineSet = <N extends string, D extends SchemaDefinition<string, z.ZodTypeAny>>(
    name: N,
    ...schemas: TaggedArray<D>
): MessageSet<N, D> => ({
    name,
    schemas,
});