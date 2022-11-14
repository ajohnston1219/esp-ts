import { AnyChannelSchema, ignoreChannel, IgnoreChannel } from '../stream';
import { KeysOfUnion } from '../utils/types';
import { Component, ComponentConfig, ComponentHandlerFunction, ComponentMessageTypes, ComponentType, createComponent } from '../component';
import { AnySchemaDefinition, define, GetTaggedObject, SchemaDefinition, SchemaType, TypeOfSchema } from '../schema';

export type ViewResultSuccess<T extends SchemaType> = {
    readonly _tag: 'Success';
    readonly result: T;
}
export type ViewResultFailure<FR extends string> = {
    readonly _tag: 'Failure';
    readonly reason: FR;
    readonly message: string;
}

type InDef = SchemaDefinition<'input', SchemaType>;
type OutDef = SchemaDefinition<'output', SchemaType>;
type QueryOrUpdate<N extends string, In extends InDef, Out extends OutDef> = {
    readonly _tag: N;
    readonly input: In;
    readonly output: Out;
    readonly execute: ViewQueryOrUpdateFunction<In, Out>;
}

type Query<N extends string, In extends InDef, Out extends OutDef> = QueryOrUpdate<N, In, Out>;
type Update<N extends string, In extends InDef, Out extends OutDef> = QueryOrUpdate<N, In, Out>;
export type AnyQuery = Query<string, InDef, OutDef>;
export type AnyUpdate = Update<string, InDef, OutDef>;

export type QueryMap<Q extends AnyQuery> = {
    [Tag in Q['_tag']]: GetTaggedObject<Q, Tag>;
}
export type UpdateMap<U extends AnyUpdate> = {
    [Tag in U['_tag']]: GetTaggedObject<U, Tag>;
}
export type AnyQueryMap = QueryMap<AnyQuery>;
export type AnyUpdateMap = UpdateMap<AnyUpdate>;

interface QUConfig<N extends string, In extends InDef, Out extends OutDef> {
    readonly name: N;
    readonly input: In['_output']['schema'];
    readonly output: Out['_output']['schema'];
    readonly execute: ViewQueryOrUpdateFunction<In, Out>;
}
export const defineQuery = <N extends string, In extends InDef, Out extends OutDef>({
    name,
    input,
    output,
    execute,
}: QUConfig<N, In, Out>): Query<N, In, Out> => ({
    _tag: name,
    input: define('input', input) as any,
    output: define('output', output) as any,
    execute: execute,
});
export const defineQueries = <Q extends AnyQuery[]>(
    ...schemas: Q
): QueryMap<Q[number]> => schemas.reduce((acc, curr) => ({
    ...acc,
    [curr._tag]: curr,
}), {} as QueryMap<Q[number]>)

export const defineUpdate = <N extends string, In extends InDef, Out extends OutDef>({
    name,
    input,
    output,
    execute,
}: QUConfig<N, In, Out>): Update<N, In, Out> => ({
    _tag: name,
    input: define('input', input) as any,
    output: define('output', output) as any,
    execute: execute,
});
export const defineUpdates = <U extends AnyUpdate[]>(
    ...schemas: U
): UpdateMap<U[number]> => schemas.reduce((acc, curr) => ({
    ...acc,
    [curr._tag]: curr,
}), {} as UpdateMap<U[number]>)

export interface ViewSchema<
    EventSchema extends AnyChannelSchema,
    QuerySchema extends AnyQuery,
    UpdateSchema extends AnyUpdate
> {
    readonly events: {
        [Tag in EventSchema['_tag']]: GetTaggedObject<EventSchema, Tag>;
    };
    readonly queries: {
        [Tag in QuerySchema['_tag']]: GetTaggedObject<QuerySchema, Tag>;
    }
    readonly updates: {
        [Tag in UpdateSchema['_tag']]: GetTaggedObject<UpdateSchema, Tag>;
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
export type ViewMessageType<A extends AnyViewConfig> = ComponentMessageTypes<ViewComponent<A>, 'In'>;
export type QueryTags<C extends AnyViewConfig> = KeysOfUnion<C['schema']['queries']>;
export type UpdateTags<C extends AnyViewConfig> = KeysOfUnion<C['schema']['updates']>;

export type ViewComponent<V extends AnyViewConfig> =
    ComponentConfig<
        V['name'],
        EventSchemas<V['schema'], ChannelKeys<V['schema']>>,
        IgnoreChannel
    >;


export interface View<Config extends AnyViewConfig, FailureReason extends string> {
    readonly config: Config;
    readonly component: Component<ViewComponent<Config>, FailureReason>;
    readonly queries: QueryFunctionMap<Config>;
    readonly updates: UpdateFunctionMap<Config>;
}

export type ViewHandlerFunction<V extends AnyViewConfig, FR extends string> =
    (queries: QueryFunctionMap<V>, updates: UpdateFunctionMap<V>) => ComponentHandlerFunction<ViewComponent<V>, FR, false>;


type Param<QU extends AnyQuery | AnyUpdate, IO extends 'input' | 'output'> = TypeOfSchema<QU[IO]>;
type QueryParam<Q extends AnyQuery, IO extends 'input' | 'output'> = Param<Q, IO>;
type QueryParams<V extends AnyViewConfig, Tag extends QueryTags<V>, IO extends 'input' | 'output'> =
    QueryParam<V['schema']['queries'][Tag], IO>;
type UpdateParam<Q extends AnyQuery, IO extends 'input' | 'output'> = Q[IO];
type UpdateParams<V extends AnyViewConfig, Tag extends UpdateTags<V>, IO extends 'input' | 'output'> =
    UpdateParam<V['schema']['updates'][Tag], IO>;
export type ViewQueryOrUpdateFunction<In extends AnySchemaDefinition, Out extends AnySchemaDefinition> =
    (input: TypeOfSchema<In>) => Promise<TypeOfSchema<Out>>;
export type ViewQueryFunction<Q extends AnyQuery> = ViewQueryOrUpdateFunction<Q['input'], Q['output']>;
export type ViewUpdateFunction<U extends AnyUpdate> = ViewQueryOrUpdateFunction<U['input'], U['output']>;
export type QueryFunctionMap<V extends AnyViewConfig> = {
    [Tag in KeysOfUnion<V['schema']['queries']>]: ViewQueryFunction<GetTaggedObject<V['schema']['queries'][Tag], Tag>>;
}
export type UpdateFunctionMap<V extends AnyViewConfig> = {
    [Tag in KeysOfUnion<V['schema']['updates']>]: ViewUpdateFunction<GetTaggedObject<V['schema']['updates'][Tag], Tag>>;
}

export function createView<Config extends AnyViewConfig, FailureReason extends string>(
    config: Config,
    handler: ViewHandlerFunction<Config, FailureReason>,
): View<Config, FailureReason> {

    const queries: QueryFunctionMap<Config> = Object.keys(config.schema.queries).reduce((acc, key) => {
        const query = (config.schema.queries as any)[key] as any;
        return { ...acc, [key]: query.execute };
    }, {} as any);
    const updates: UpdateFunctionMap<Config> = Object.keys(config.schema.updates).reduce((acc, key) => {
        const update = (config.schema.updates as any)[key] as any;
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