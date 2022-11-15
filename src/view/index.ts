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


export interface View<Config extends AnyViewConfig, FailureReason extends string> {
    readonly config: Config;
    readonly component: Component<ViewComponent<Config>, FailureReason>;
    readonly model: Config['model'];
}

export type ViewHandlerFunction<V extends AnyViewConfig, FR extends string> =
    (model: V['model']) => ComponentHandlerFunction<ViewComponent<V>, FR, false>;



export function createView<Config extends AnyViewConfig, FailureReason extends string>(
    config: Config,
    handler: ViewHandlerFunction<Config, FailureReason>,
): View<Config, FailureReason> {

    type Comp = ViewComponent<Config>;
    const component: ComponentType<Comp, FailureReason> = createComponent<Comp, FailureReason, false>({
        name: config.name,
        inputChannels: config.schema.events as any,
        outputChannels: ignoreChannel(),
    },  handler(config.model));

    return {
        config,
        component,
        model: config.model,
    };
}