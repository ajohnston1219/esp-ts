import { AnyChannelSchema, ignoreChannel, IgnoreChannel } from '../stream';
import { KeysOfUnion } from '../utils/types';
import { Component, ComponentConfig, ComponentHandlerFunction, ComponentMessageType, ComponentType, createComponent } from '../component';
import { z } from 'zod';

export type ViewResultSuccess<T extends z.ZodTypeAny> = {
    _tag: 'Success';
    result: T;
}
export type ViewResultFailure<FR extends string> = {
    _tag: 'Failure';
    reason: FR;
    message: string;
}
type QueryOrUpdate<N extends string, In extends z.ZodTypeAny, Out extends z.ZodTypeAny> = {
    name: N;
    schema: {
        input: In,
        output: Out,
    };
    execute: ViewQueryOrUpdateFunction<In, Out>;
}
type Query<N extends string, In extends z.ZodTypeAny, Out extends z.ZodTypeAny> = QueryOrUpdate<N, In, Out> & { _tag: 'Query' };
export function createQuery<N extends string, In extends z.ZodTypeAny, Out extends z.ZodTypeAny>(
    schema: Omit<Query<N, In, Out>, '_tag'>,
): Query<N, In, Out> {
    return {
        _tag: 'Query',
        ...schema,
    };
}
type Update<N extends string, In extends z.ZodTypeAny, Out extends z.ZodTypeAny> = QueryOrUpdate<N, In, Out> & { _tag: 'Update' };
export function createUpdate<N extends string, In extends z.ZodTypeAny, Out extends z.ZodTypeAny>(
    schema: Omit<Update<N, In, Out>, '_tag'>,
): Update<N, In, Out> {
    return {
        _tag: 'Update',
        ...schema,
    };
}
type ViewQueryOrUpdateFunction<In extends z.ZodTypeAny, Out extends z.ZodTypeAny> = (input: z.infer<In>) => Promise<z.infer<Out>>;
export type ViewQueryFunction<Q extends AnyQuery> = ViewQueryOrUpdateFunction<Q['schema']['input'], Q['schema']['output']>;
export type ViewUpdateFunction<U extends AnyUpdate> = ViewQueryOrUpdateFunction<U['schema']['input'], U['schema']['output']>; 
type AnyQuery = Query<string, z.ZodTypeAny, z.ZodTypeAny>;
type AnyUpdate = Update<string, z.ZodTypeAny, z.ZodTypeAny>;
export type QuerySchema<Q extends AnyQuery> = {
    [N in Q['name']]: Query<N, Q['schema']['input'], Q['schema']['output']>;
}
export type UpdateSchema<U extends AnyUpdate> = {
    [N in U['name']]: Update<N, U['schema']['input'], U['schema']['output']>;
}
export type AnyQuerySchema = QuerySchema<AnyQuery>;
export type AnyUpdateSchema = UpdateSchema<AnyUpdate>;

export interface ViewSchema<
    EventSchema extends AnyChannelSchema,
    QuerySchema extends AnyQuerySchema,
    UpdateSchema extends AnyUpdateSchema
> {
    readonly events: {
        [Key in EventSchema['name']]: EventSchema;
    };
    readonly queries: QuerySchema;
    readonly updates: UpdateSchema;
}
export type AnyViewSchema = ViewSchema<AnyChannelSchema, AnyQuerySchema, AnyUpdateSchema>;

export interface ViewConfig<Name extends string, V extends AnyViewSchema> {
    readonly name: Name;
    readonly schema: V;
}
export type AnyViewConfig = ViewConfig<string, AnyViewSchema>;

export type ChannelKeys<V extends AnyViewSchema> = KeysOfUnion<V['events']>;
export type EventSchemas<V extends AnyViewSchema, N extends KeysOfUnion<V['events']>> = V['events'][N];
export type EventSchema<V extends AnyViewSchema, N extends ChannelKeys<V>> = EventSchemas<V, N>;
export type ViewMessageType<A extends AnyViewConfig> = ComponentMessageType<ViewComponent<A>, 'In'>;

export type ViewComponent<V extends AnyViewConfig> =
    ComponentConfig<
        V['name'],
        EventSchemas<V['schema'], ChannelKeys<V['schema']>>,
        IgnoreChannel
    >;


type QueryFunctionMap<V extends AnyViewConfig> = {
    [Key in KeysOfUnion<V['schema']['queries']>]: ViewQueryFunction<V['schema']['queries'][Key]>;
}
type UpdateFunctionMap<V extends AnyViewConfig> = {
    [Key in KeysOfUnion<V['schema']['updates']>]: ViewUpdateFunction<V['schema']['updates'][Key]>;
}
export interface View<Config extends AnyViewConfig, FailureReason extends string> {
    readonly config: Config;
    readonly component: Component<ViewComponent<Config>, FailureReason>;
    readonly queries: QueryFunctionMap<Config>;
    readonly updates: UpdateFunctionMap<Config>;
}

export type ViewHandlerFunction<V extends AnyViewConfig, FR extends string> =
    (queries: QueryFunctionMap<V>, updates: UpdateFunctionMap<V>) => ComponentHandlerFunction<ViewComponent<V>, FR, false>;

export function createView<Config extends AnyViewConfig, FailureReason extends string>(
    config: Config,
    handler: ViewHandlerFunction<Config, FailureReason>,
): View<Config, FailureReason> {

    const queries: QueryFunctionMap<Config> = Object.keys(config.schema.queries).reduce((acc, key) => {
        const query = config.schema.queries[key];
        return { ...acc, [key]: query.execute };
    }, {} as any);
    const updates: UpdateFunctionMap<Config> = Object.keys(config.schema.updates).reduce((acc, key) => {
        const update = config.schema.updates[key];
        return { ...acc, [key]: update.execute };
    }, {} as any);

    type Comp = ViewComponent<Config>;
    const component: ComponentType<Comp, FailureReason> = createComponent<Comp, FailureReason, false>({
        name: config.name,
        inputChannels: config.schema.events as any,
        outputChannels: ignoreChannel(),
    },  handler(queries, updates));

    return {
        config,
        component,
        queries,
        updates,
    };
}