import { AnyChannelSchema, ignoreChannel, IgnoreChannel } from '../stream';
import { KeysOfUnion } from '../utils/types';
import { Component, ComponentConfig, ComponentHandlerFunction, ComponentMessageTypes, ComponentType, createComponent } from '../component';
import { AnySchemaDefinition, define, GetTaggedObject, SchemaDefinition, SchemaType, TypeOfSchema } from '../schema';
import { AnyModel, Model } from './model';

export type ViewResultSuccess<T extends SchemaType> = {
    readonly _tag: 'Success';
    readonly result: T;
}
export type ViewResultFailure<FR extends string> = {
    readonly _tag: 'Failure';
    readonly reason: FR;
    readonly message: string;
}

export interface ViewSchema<
    EventSchema extends AnyChannelSchema,
> {
    readonly events: {
        [Tag in EventSchema['_tag']]: GetTaggedObject<EventSchema, Tag>;
    };
}
export type AnyViewSchema = ViewSchema<AnyChannelSchema>;

export interface ViewConfig<Name extends string, V extends AnyViewSchema, M extends AnyModel> {
    readonly name: Name;
    readonly schema: V;
    readonly model: M;
}
export type AnyViewConfig = ViewConfig<string, AnyViewSchema, AnyModel>;

export type ChannelKeys<V extends AnyViewSchema> = KeysOfUnion<V['events']>;
export type EventSchemas<V extends AnyViewSchema, N extends KeysOfUnion<V['events']>> = V['events'][N];
export type EventSchema<V extends AnyViewSchema, N extends ChannelKeys<V>> = EventSchemas<V, N>;
export type ViewMessageType<A extends AnyViewConfig> = ComponentMessageTypes<ViewComponent<A>, 'In'>;

export type ViewComponent<V extends AnyViewConfig> =
    ComponentConfig<
        V['name'],
        EventSchemas<V['schema'], ChannelKeys<V['schema']>>,
        IgnoreChannel
    >;


export interface View<Config extends AnyViewConfig, In extends AnyChannelSchema, FailureReason extends string> {
    readonly config: Config;
    readonly component: Component<ComponentConfig<Config['name'], In, AnyChannelSchema>, In, AnyChannelSchema, FailureReason>
    readonly model: Config['model'];
}

export type ViewHandlerFunction<C extends ComponentConfig<string, In, IgnoreChannel>, In extends AnyChannelSchema, M extends AnyModel, FR extends string> =
    (model: M) => ComponentHandlerFunction<C, In, IgnoreChannel, FR, false>;



export function createView<N extends string, In extends AnyChannelSchema, M extends AnyModel, FailureReason extends string>(
    config: ViewConfig<N, ViewSchema<In>, M>,
    handler: ViewHandlerFunction<ComponentConfig<N, In, IgnoreChannel>, In, M, FailureReason>,
): View<ViewConfig<N, ViewSchema<In>, M>, In, FailureReason> {

    type Out = ReturnType<typeof ignoreChannel>['__IGNORE__'];
    type Comp = ComponentConfig<N, In, Out>;
    const component: Component<Comp, In, Out, FailureReason> = createComponent({
        name: config.name,
        inputChannels: config.schema.events as any,
        outputChannels: ignoreChannel(),
    },  handler(config.model));

    return {
        config,
        component: component as any,
        model: config.model,
    };
}