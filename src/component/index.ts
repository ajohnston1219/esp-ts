import { MessageCreator } from "../message";
import { AnyChannelSchema, ChannelMessageCreators, ChannelSchemas, ChannelTags, getMessageCreators } from "../stream";

type KeysOfUnion<T> = T extends T ? keyof T : never;

export interface ComponentConfig<Name extends string, Schema extends AnyChannelSchema> {
    readonly name: Name;
    readonly channels: {
        [N in Schema['name']]: Schema;
    }
}
export type AnyComponentConfig = ComponentConfig<string, AnyChannelSchema>;
export type ComponentMessageCreators<C extends AnyComponentConfig, N extends ComponentChannelNames<C>> = {
    [Tag in ComponentTags<ComponentChannelSchemas<C>>]: MessageCreator<ChannelSchemas<ComponentChannelSchema<C, N>, Tag>>;
}
export type Component<Name extends string, Config extends AnyComponentConfig> = {
    readonly name: Name;
    readonly messages: {
        [N in ComponentChannelNames<Config>]: ComponentMessageCreators<Config, N>;
    }
}
export type ComponentChannelSchema<C extends AnyComponentConfig, N extends ComponentChannelNames<C>> = C['channels'][N];
export type ComponentChannelMessageCreators<C extends AnyComponentConfig, N extends ComponentChannelNames<C>> = ChannelMessageCreators<C['channels'][N]>;
export type ComponentChannelSchemas<C extends AnyComponentConfig> = C['channels'][keyof C['channels']];
export type ComponentChannelNames<C extends AnyComponentConfig> = keyof C['channels'];
export type ComponentTags<C extends AnyChannelSchema> = KeysOfUnion<C['schemas']>;
export type ComponentType<C extends AnyComponentConfig> = Component<C['name'], C>;

export function createComponent<C extends AnyComponentConfig>(config: C): ComponentType<C> {
    return Object.keys(config.channels).reduce<ComponentType<C>>((acc, curr) => ({
        ...acc,
        ...getMessageCreators<ComponentChannelSchemas<C>>(config.channels[curr] as ComponentChannelSchemas<C>),
    }), {} as any);
}