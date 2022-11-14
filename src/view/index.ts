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
type AnyQuery = Query<string, z.ZodTypeAny, z.ZodTypeAny>;
type AnyUpdate = Update<string, z.ZodTypeAny, z.ZodTypeAny>;
type QueryKeys<Q extends AnyQuery> = KeysOfUnion<Q['name']>
type UpdateKeys<U extends AnyUpdate> = KeysOfUnion<U['name']>

export interface ViewSchema<
    EventSchema extends AnyChannelSchema,
    QuerySchema extends AnyQuery,
    UpdateSchema extends AnyUpdate
> {
    readonly events: {
        [Key in EventSchema['name']]: EventSchema;
    };
    readonly queries: {
        [Key in QuerySchema['name']]: QuerySchema;
    }
    readonly updates: {
        [Key in UpdateSchema['name']]: UpdateSchema;
    }
}
export type AnyViewSchema = ViewSchema<AnyChannelSchema, AnyQuery, AnyUpdate>;

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


export type QueryMap<Config extends AnyViewConfig> = {
    [Key in KeysOfUnion<Config['schema']['queries']>]: Query<Key, Config['schema']['queries'][Key]['schema']['input'], Config['schema']['queries'][Key]['schema']['output']>;
}
export type AnyQueryMap = QueryMap<AnyViewConfig>;
export type AnyUpdateMap = UpdateMap<AnyViewConfig>;
export type UpdateMap<Config extends AnyViewConfig> = {
    [Key in KeysOfUnion<Config['schema']['updates']>]: Update<Key, Config['schema']['updates'][Key]['schema']['input'], Config['schema']['updates'][Key]['schema']['output']>;
}
export interface View<Config extends AnyViewConfig, FailureReason extends string> {
    readonly config: Config;
    readonly component: Component<ViewComponent<Config>, FailureReason>;
    readonly queries: QueryFunctionMap<Config>;
    readonly updates: UpdateFunctionMap<Config>;
}

export type ViewHandlerFunction<V extends AnyViewConfig, FR extends string> =
    (queries: QueryFunctionMap<V>, updates: UpdateFunctionMap<V>) => ComponentHandlerFunction<ViewComponent<V>, FR, false>;

type ViewQueryOrUpdateFunction<In extends z.ZodTypeAny, Out extends z.ZodTypeAny> = (input: z.infer<In>) => Promise<z.infer<Out>>;
export type ViewQueryFunction<Q extends AnyQuery> = ViewQueryOrUpdateFunction<Q['schema']['input'], Q['schema']['output']>;
export type ViewUpdateFunction<U extends AnyUpdate> = ViewQueryOrUpdateFunction<U['schema']['input'], U['schema']['output']>; 
export type QueryFunctionMap<V extends AnyViewConfig> = {
    [Key in KeysOfUnion<V['schema']['queries']>]: ViewQueryOrUpdateFunction<V['schema']['queries'][Key]['schema']['input'], V['schema']['queries'][Key]['schema']['output']>
}
export type UpdateFunctionMap<V extends AnyViewConfig> = {
    [Key in KeysOfUnion<V['schema']['updates']>]: ViewQueryOrUpdateFunction<V['schema']['updates'][Key]['schema']['input'], V['schema']['updates'][Key]['schema']['output']>
}

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