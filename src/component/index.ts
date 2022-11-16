import { concatMap, fromEvent, lastValueFrom, Observable, shareReplay, takeUntil, tap } from "rxjs";
import { AnyMessage, IncomingMessage, Message, MessageCreatorNoId, MessagePayload, MessageResult, MessageType, OutgoingMessage, TraceId } from "../message";
import { AggregateId, AnyChannelSchema, ChannelMessageSchema, ChannelTags, getMessageCreatorsNoId, MessageHooks } from "../stream";
import { EventEmitter } from 'node:events';
import { KeysOfUnion } from "../utils/types";

export interface ComponentConfig<Name extends string, InputSchema extends AnyChannelSchema, OutputSchema extends AnyChannelSchema> {
    readonly name: Name;
    readonly inputChannels: {
        [N in InputSchema['_tag']]: InputSchema extends { readonly _tag: N } ? InputSchema : never;
    }
    readonly outputChannels: {
        [N in OutputSchema['_tag']]: OutputSchema extends { readonly _tag: N } ? OutputSchema : never;
    }
}

export type Component<Config extends ComponentConfig<string, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, FailureReason extends string> = {
    readonly config: Config;
    readonly messages: {
        recv: (traceId: TraceId) => {
            [N in ComponentChannelNames<Config, 'In'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'In'>;
        },
        send: (traceId: TraceId) => {
            [N in ComponentChannelNames<Config, 'Out'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'Out'>;
        },
        create: {
            recv: (traceId: TraceId) => {
                [N in ComponentChannelNames<Config, 'In'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'In'>;
            },
            send: (traceId: TraceId) => {
                [N in ComponentChannelNames<Config, 'Out'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'Out'>;
            },
        },
    };
    readonly recvRaw: (message: IncomingMessage<AnyMessage>) => void;
    readonly sendRaw: (message: IncomingMessage<AnyMessage>) => void;
    readonly handler: ComponentHandlerFunction<Config, In, Out, FailureReason>;
    readonly inbox: Observable<MessageResult<MessageType<ChannelMessageSchema<In, ChannelTags<In>>>>>;
    readonly outbox: Observable<MessageResult<MessageType<ChannelMessageSchema<Out, ChannelTags<Out>>>>>;
    readonly stop: () => Promise<void>;
};

export function createComponent<N extends string, C extends ComponentConfig<N, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, FR extends string, CanSend extends boolean = true>(
    config: C,
    handler: ComponentHandlerFunction<C, In, Out, FR, CanSend>,
): Component<C, In, Out, FR> {

    type InResult = MessageResult<MessageType<ChannelMessageSchema<In, ChannelTags<In>>>>;
    type OutResult = MessageResult<MessageType<ChannelMessageSchema<Out, ChannelTags<Out>>>>;

    const emitter = new EventEmitter({ captureRejections: true });
    const stopper = fromEvent(emitter, 'stop');

    const recv = createComponentChannels<C, In, Out, 'In', FR>(config, emitter, 'In');
    const send = createComponentChannels<C, In, Out, 'Out', FR>(config, emitter, 'Out');
    const create = {
        recv: createComponentChannels<C, In, Out, 'In', FR>(config, emitter, 'In', true),
        send: createComponentChannels<C, In, Out, 'Out', FR>(config, emitter, 'Out', true),
    };

    const inbox = fromEvent(emitter, 'in').pipe(
        takeUntil(stopper) as any,
        shareReplay(1e3),
    ) as Observable<InResult>
    const outbox = fromEvent(emitter, 'out').pipe(
        takeUntil(stopper) as any,
        shareReplay(1e3),
    ) as Observable<OutResult>

    const recvRaw = (incoming: IncomingMessage<AnyMessage>) => {
        emitter.emit('in', {
            traceId: incoming.traceId,
            streamName: incoming.streamName,
            message: incoming.message,
        });
    }
    const sendRaw = (outgoing: OutgoingMessage<AnyMessage>) => {
        emitter.emit('out', {
            traceId: outgoing.traceId,
            streamName: outgoing.streamName,
            message: outgoing.message,
        });
    }

    const handleMessage = async (msg: InResult) => {
        await handle(msg);
    }
    const inSub = inbox.pipe(concatMap(async msg => await handleMessage(msg))).subscribe();
    const outSub = outbox.subscribe();

    const stop = async () => {
        emitter.emit('stop');
        inSub.unsubscribe();
        outSub.unsubscribe();
        await Promise.all([
            lastValueFrom(inbox, { defaultValue: null }),
            lastValueFrom(outbox, { defaultValue: null })
        ]);
    }

    const component: Component<C, In, Out, FR> = {
        config,
        messages: { recv, send, create },
        recvRaw,
        sendRaw,
        handler,
        inbox,
        outbox,
        stop,
    }

    const createApi: (t: TraceId) => ComponentAPI<C, In, Out, FR> = traceId => ({
        send: send(traceId),
        sendRaw,
        success: () => ({ _tag: 'Success', traceId }),
        failure: (reason, message) => ({ _tag: 'Failure', traceId, reason, message }),
    });
    const handle = async (msg: InResult) => {
        await handler(createApi(msg.traceId))(msg);
    }

    return component;
}

function createHooks<Config extends ComponentConfig<string, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, CT extends ChannelType>(
    config: Config,
    emitter: EventEmitter,
    channelType: CT,
): MessageHooks<ComponentChannelSchema<Config, ComponentChannelNames<Config, CT>, CT>> {
    const eventType = channelType === 'In' ? 'in' : 'out';
    const channels = channelType === 'In' ? config.inputChannels : config.outputChannels;
    const hooks = Object.keys(channels).reduce((acc, curr) => {
        const schema = (channels as any)[curr].schema;
        type MT = CT extends 'In' ? MessageType<ChannelMessageSchema<In, ChannelTags<In>>> : MessageType<ChannelMessageSchema<Out, ChannelTags<In>>>;
        const getMessage = (msg: MessageResult<MT>) => channelType === 'In'
            ? msg
            : { ...msg, channel: schema._tag, service: schema.service };
        const hook = (msg: MessageResult<MT>) => {
            emitter.emit(eventType, getMessage(msg));
        }
        const h = Object.keys(schema).reduce((acc, _curr) => {
            return { ...acc, [_curr]: { after: [ hook ] } };
        }, {} as any);
        const result: any = {
            ...acc,
            [curr]: h,
        };
        return result;
    }, {} as any);
    return hooks;
}

type ComponentSendOrRecv<Config extends AnyComponentConfig, CT extends ChannelType, FR extends string> =
    Component<Config, AnyChannelSchema, AnyChannelSchema, FR>['messages'][CT extends 'In' ? 'recv' : 'send'];
function createComponentChannels<Config extends ComponentConfig<string, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, CT extends ChannelType, FR extends string>(
    config: Config,
    emitter: EventEmitter,
    channelType: CT,
    noHooks?: boolean,
): ComponentSendOrRecv<Config, CT, FR> {
    const channels = channelType === 'In' ? config.inputChannels : config.outputChannels;
    const hooks = noHooks ? undefined : createHooks<Config, In, Out, CT>(config, emitter, channelType);
    const componentChannels = Object.keys(channels).reduce((acc, curr) => {
        const channel = (channels as any)[curr] as ComponentChannelSchema<Config, ComponentChannelNames<Config, CT>, CT>;
        return {
            ...acc,
            [curr]: (traceId: TraceId) => (id: AggregateId) =>
                getMessageCreatorsNoId<ComponentChannelSchema<Config, ComponentChannelNames<Config, CT>, CT>>(traceId, id, channel, hooks && (hooks as any)[curr]),
        }
    }, {} as any);
    return (traceId: TraceId) => Object.keys(componentChannels).reduce((acc, key) => {
        const curr = componentChannels[key];
        return {
            ...acc,
            [key]: curr(traceId),
        }
    }, {} as any);
}

type ComponentHandlerSuccess = {
    _tag: 'Success',
    traceId: TraceId;
}
type ComponentHandlerFailure<FailureReason extends string> = {
    _tag: 'Failure',
    traceId: TraceId;
    reason: FailureReason,
    message: string,
}
export type ComponentHandlerResult<FailureReason extends string> = ComponentHandlerFailure<FailureReason> | ComponentHandlerSuccess;
export type ComponentAPINoSend<FR extends string> = {
    success: () => ComponentHandlerSuccess;
    failure: (reason: FR, message: string) => ComponentHandlerFailure<FR>;
}
export type ComponentAPISend<Config extends AnyComponentConfig, FR extends string> = {
    send: {
        [N in ComponentChannelNames<Config, 'Out'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'Out'>;
    },
    sendRaw: (msg: OutgoingMessage<AnyMessage>) => void;
} & ComponentAPINoSend<FR>;
export type ComponentAPI<Config extends ComponentConfig<string, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, FR extends string, CanSend extends boolean = true> = CanSend extends true
    ? ComponentAPISend<Config, FR>
    : ComponentAPINoSend<FR>;
export type ComponentHandlerFunction<Config extends ComponentConfig<string, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, FailureReason extends string, CanSend extends boolean = true> =
    (component: ComponentAPI<Config, In, Out, FailureReason, CanSend>) =>
        (msg: MessageResult<MessageType<ChannelMessageSchema<In, ChannelTags<In>>>>) => Promise<ComponentHandlerResult<FailureReason>>;

export type ComponentMessageCreators<C extends AnyComponentConfig, N extends ComponentChannelNames<C, CT>, CT extends ChannelType> = {
    [Tag in ComponentTags<ComponentChannelSchema<C, N, CT>>]: MessageCreatorNoId<Message<Tag, MessagePayload<C[ComponentChannelKey<CT>][ComponentChannelNames<C, CT>]['schema'][Tag]>>>;
}
export type AnyComponentConfig = ComponentConfig<string, AnyChannelSchema, AnyChannelSchema>;
export type AnyComponent = Component<AnyComponentConfig, AnyChannelSchema, AnyChannelSchema, string>;

type ChannelType = 'In' | 'Out';
type ComponentChannelKey<CT extends ChannelType> =
    CT extends 'In' ? 'inputChannels' : 'outputChannels';

export type ComponentChannelNames<C extends AnyComponentConfig, CT extends ChannelType> =
    KeysOfUnion<C[ComponentChannelKey<CT>]>;
export type ComponentServiceNames<C extends AnyComponentConfig, CT extends ChannelType> =
    C[ComponentChannelKey<CT>][ComponentChannelNames<C, CT>]['service'];
export type ComponentChannelSchema<C extends AnyComponentConfig, N extends ComponentChannelNames<C, CT>, CT extends ChannelType> =
    C[ComponentChannelKey<CT>][N];
export type ComponentChannelMessageSchemas<C extends AnyComponentConfig, CT extends ChannelType> =
    ComponentChannelSchema<C, ComponentChannelNames<C, CT>, CT>['schema'][ComponentMessageTags<C, CT, ComponentChannelNames<C, CT>>];
export type ComponentTags<C extends AnyChannelSchema> = KeysOfUnion<C['schema']>;
export type ComponentMessageTags<C extends AnyComponentConfig, CT extends ChannelType, N extends ComponentChannelNames<C, CT>> =
    ComponentTags<ComponentChannelSchema<C, N, CT>>;
export type ComponentType<C extends ComponentConfig<string, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, FR extends string> = Component<C, In, Out, FR>;

export type ComponentMessageSchema<C extends AnyComponentConfig, CT extends ChannelType, N extends ComponentChannelNames<C, CT>> =
    ComponentChannelSchema<C, N, CT>['schema'][ComponentMessageTags<C, CT, N>];
export type ComponentMessageSchemas<C extends AnyComponentConfig, CT extends ChannelType> =
    ComponentChannelSchema<C, ComponentChannelNames<C, CT>, CT>;
export type ComponentMessageType<C extends ComponentConfig<string, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, CT extends ChannelType, N extends ComponentChannelNames<C, CT>> =
    MessageType<ComponentMessageSchema<C, CT, N>>;
export type ComponentMessageTypes<C extends AnyComponentConfig, CT extends ChannelType, N extends ComponentChannelNames<C, CT> = ComponentChannelNames<C, CT>> =
    MessageType<ComponentMessageSchema<C, CT, N>>;
