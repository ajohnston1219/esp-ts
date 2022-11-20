import { Component, ComponentConfig, ComponentSubscriptions, createComponent, IgnoreChannel, ignoreChannel } from '../component';
import { SchemaType } from '../schema';
import { AnyModel } from './model';
import { AnyChannelSchema, ChannelNames, ChannelSchemas } from '../schema/channel';
import { GetObject, TaggedArray, TaggedObject } from '../schema/tagged';
import { MessageType } from '../message';
import { AnySubscription } from '../schema/subscription';

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
    readonly events: TaggedArray<TaggedObject<EventSchema['name'], EventSchema>>;
}
export type AnyViewSchema = ViewSchema<AnyChannelSchema>;

export interface ViewConfig<Name extends string, V extends AnyViewSchema, M extends AnyModel> {
    readonly name: Name;
    readonly schema: V;
    readonly model: M;
}
export type AnyViewConfig = ViewConfig<string, AnyViewSchema, AnyModel>;

export type EventChannel<V extends AnyViewSchema> = GetObject<V['events'][number]>;
export type EventKeys<V extends AnyViewSchema> = ChannelNames<EventChannel<V>>;
export type EventSchemas<V extends AnyViewSchema> = ChannelSchemas<EventChannel<V>>;
export type ViewMessageType<V extends AnyViewConfig> = MessageType<ChannelSchemas<EventChannel<V['schema']>>>;

export type ViewComponent<V extends AnyViewConfig> =
    ComponentConfig<
        V['name'],
        EventChannel<V['schema']>,
        IgnoreChannel
    >;


export interface View<Config extends AnyViewConfig, In extends AnyChannelSchema, FailureReason extends string> {
    readonly config: Config;
    readonly component: Component<ComponentConfig<Config['name'], In, AnyChannelSchema>, In, AnyChannelSchema, FailureReason>
    readonly model: Config['model'];
}

export function createView<N extends string, In extends AnyChannelSchema, M extends AnyModel, FailureReason extends string>(
    config: ViewConfig<N, ViewSchema<In>, M>,
    subscriptions: ComponentSubscriptions<AnySubscription<In, IgnoreChannel>, In, IgnoreChannel>,
): View<ViewConfig<N, ViewSchema<In>, M>, In, FailureReason> {

    type Out = IgnoreChannel;
    type Comp = ComponentConfig<N, In, Out>;
    const component: Component<Comp, In, Out, FailureReason> = createComponent({
        name: config.name,
        inputChannels: config.schema.events,
        outputChannels: ignoreChannel(),
        subscriptions,
    });

    return {
        config,
        component: component as any,
        model: config.model,
    };
}