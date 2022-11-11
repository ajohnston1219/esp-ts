import { MessageCreator, MessageCreatorNoId, MessageHookFunction, MessageResult, MessageType } from "../message";
import { AggregateId, AnyChannelSchema, ChannelMessageCreators, ChannelPayloads, ChannelSchemas, ChannelTags, getMessageCreators, getMessageCreatorsNoId, MessageHooks } from "../stream";

type KeysOfUnion<T> = T extends T ? keyof T : never;

export interface ComponentConfig<Name extends string, Schema extends AnyChannelSchema> {
    readonly name: Name;
    readonly inputChannels: {
        [N in Schema['name']]: Schema;
    }
    readonly outputChannels: {
        [N in Schema['name']]: Schema;
    }
}
export type AnyComponentConfig = ComponentConfig<string, AnyChannelSchema>;
export type ComponentMessageCreators<C extends AnyComponentConfig, N extends ComponentChannelNames<C, CT>, CT extends ChannelType> = {
    [Tag in ComponentTags<ComponentChannelSchemas<C, CT>>]: MessageCreatorNoId<ChannelSchemas<ComponentChannelSchema<C, N, CT>, Tag>>;
}
export type Component<Name extends string, Config extends AnyComponentConfig> = {
    readonly name: Name;
    readonly messages: {
        recv: {
            [N in ComponentChannelNames<Config, 'In'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'In'>;
        },
        send: {
            [N in ComponentChannelNames<Config, 'Out'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'Out'>;
        },
    }
    readonly getInbox: () => MessageResult<InMessage<Config>>[],
    readonly getOutbox: () => MessageResult<OutMessage<Config>>[],
}
type ChannelType = 'In' | 'Out';
type ComponentChannelNames<C extends AnyComponentConfig, CT extends ChannelType> =
    CT extends 'In' ? keyof C['inputChannels'] : keyof C['outputChannels'];
type ComponentChannelSchema<C extends AnyComponentConfig, N extends ComponentChannelNames<C, CT>, CT extends ChannelType> =
    CT extends 'In' ? C['inputChannels'][N] : C['outputChannels'][N];
type ComponentChannelSchemas<C extends AnyComponentConfig, CT extends ChannelType> =
    CT extends 'In' ? C['inputChannels'][keyof C['inputChannels']] : C['outputChannels'][keyof C['outputChannels']];
type ComponentTags<C extends AnyChannelSchema> = KeysOfUnion<C['schemas']>;
type ComponentType<C extends AnyComponentConfig> = Component<C['name'], C>;
type InMessage<C extends AnyComponentConfig> = MessageType<ChannelSchemas<ComponentChannelSchemas<C, 'In'>>>;
type OutMessage<C extends AnyComponentConfig> = MessageType<ChannelSchemas<ComponentChannelSchemas<C, 'Out'>>>;

export function createComponent<C extends AnyComponentConfig>(config: C): ComponentType<C> {

    const inbox: MessageResult<InMessage<C>>[] = [];
    const outbox: MessageResult<OutMessage<C>>[] = [];

    const recvHooks = Object.keys(config.inputChannels).reduce((acc, curr) => {
        const hook = (msg: MessageResult<InMessage<C>>) => inbox.push(msg);
        const schemas = config.inputChannels[curr].schemas;
        const hooks = Object.keys(schemas).reduce((acc, _curr) => {
            return { ...acc, [_curr]: { after: [ hook ] } };
        }, {} as any);
        const result: any = {
            ...acc,
            [curr]: hooks,
        };
        return result;
    }, {} as any);
    const sendHooks = Object.keys(config.outputChannels).reduce((acc, curr) => {
        const hook = (msg: MessageResult<OutMessage<C>>) => outbox.push(msg);
        const schemas = config.outputChannels[curr].schemas;
        const hooks = Object.keys(schemas).reduce((acc, _curr) => {
            return { ...acc, [_curr]: { after: [ hook ] } };
        }, {} as any);
        const result: any = {
            ...acc,
            [curr]: hooks,
        };
        return result;
    }, {} as any);

    const recv = Object.keys(config.inputChannels).reduce((acc, curr) => {
        const hooks: any = recvHooks[curr];
        return {
            ...acc,
            [curr]: (id: AggregateId) => getMessageCreatorsNoId<ComponentChannelSchemas<C, 'In'>>(
                id,
                config.inputChannels[curr] as ComponentChannelSchemas<C, 'In'>,
                hooks,
            ),
        }
    }, {} as any);
    const send = Object.keys(config.outputChannels).reduce((acc, curr) => {
        const hooks: any = sendHooks[curr];
        return {
            ...acc,
            [curr]: (id: AggregateId) => getMessageCreatorsNoId<ComponentChannelSchemas<C, 'Out'>>(
                id,
                config.outputChannels[curr] as ComponentChannelSchemas<C, 'Out'>,
                hooks,
            ),
        }
    }, {} as any);

    return {
        name: config.name,
        messages: { recv, send },
        getInbox: () => inbox,
        getOutbox: () => outbox,
    }
}