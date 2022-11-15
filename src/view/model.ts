import { GetSchema, SchemaTag, SchemaType, TypeOfSchema } from "../schema";
import { TypeOf, z } from 'zod';

type ModelOperationSchema<N extends string, In extends z.ZodTuple, Out extends SchemaType> = z.ZodObject<{
    readonly _tag: z.ZodLiteral<N>;
    readonly schema: z.ZodFunction<In, Out>;
}>
export type AnyModelOperationSchema = ModelOperationSchema<string, z.ZodTuple, SchemaType>;

export type ModelOperationMap<O extends AnyModelOperationSchema> = {
    [Tag in SchemaTag<O>]: GetSchema<O, Tag>;
}
export type ModelOperation<N extends string, In extends z.ZodTuple, Out extends SchemaType> = {
    readonly _tag: N;
    readonly schema: ModelOperationSchema<N, In, Out>;
    readonly execute: TypeOf<z.ZodFunction<In, Out>>;
}
export type AnyModelOperation = ModelOperation<string, z.ZodTuple, SchemaType>;

type OperationConfig<In extends z.ZodTuple, Out extends SchemaType> = {
    inputs: In;
    output: Out;
    execute: TypeOf<z.ZodFunction<In, Out>>;
}

export const defineFunction = <N extends string, In extends z.ZodTuple, Out extends SchemaType>(name: N, inputs: In, output: Out): ModelOperationSchema<N, In, Out> =>
    z.object({ _tag: z.literal(name), schema: z.function(inputs, output) });

export const defineOperation = <N extends string, In extends z.ZodTuple, Out extends SchemaType>(name: N, {
    inputs,
    output,
    execute,
}: OperationConfig<In, Out>): ModelOperation<N, In, Out> => {

    return {
        _tag: name,
        schema: defineFunction<N, In, Out>(name, inputs, output),
        execute,
    }
};

export const defineQuery = defineOperation;
export const defineMutation = defineOperation;

const defineOperations = <O extends AnyModelOperation[]>(...operations: O): ModelOperationMap<O[number]['schema']> => operations.reduce((acc, curr) => ({
    ...acc,
    [curr._tag]: curr,
}), {} as ModelOperationMap<O[number]['schema']>);
export const defineQueries = defineOperations;
export const defineMutations = defineOperations;

interface ModelConfig<N extends string, Q extends AnyModelOperationSchema, M extends AnyModelOperationSchema> {
    name: N;
    query: ModelOperationMap<Q>;
    mutate: ModelOperationMap<M>;
}

export type Model<N extends string, Q extends AnyModelOperationSchema, M extends AnyModelOperationSchema> = {
    readonly _tag: N;
    readonly query: {
        [Tag in SchemaTag<Q>]: TypeOfSchema<GetSchema<Q, Tag>>;
    }
    readonly mutate: {
        [Tag in SchemaTag<M>]: TypeOfSchema<GetSchema<M, Tag>>;
    }
}
export type AnyModel = Model<string, AnyModelOperationSchema, AnyModelOperationSchema>;

export const defineModel = <N extends string, Q extends AnyModelOperationSchema, M extends AnyModelOperationSchema>(name: N, {
    query,
    mutate,
}: Omit<ModelConfig<N, Q, M>, 'name'>): Model<N, Q, M> => ({
    _tag: name,
    query: Object.keys(query).reduce((acc, curr) => {
        const q = (query as any)[curr];
        return {
            ...acc,
            [q._tag]: q.execute,
        }
    }, {} as any),
    mutate: Object.keys(mutate).reduce((acc, curr) => {
        const m = (mutate as any)[curr];
        return {
            ...acc,
            [m._tag]: m.execute,
        }
    }, {} as any),
});