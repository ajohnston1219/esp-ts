import { fromEvent, lastValueFrom, Observable, shareReplay, takeUntil } from "rxjs";
import { AnyMessage, IncomingMessage, Message, MessageCreatorNoId, MessageResult, MessageType, TraceId } from "../message";
import { AggregateId, AnyChannelSchema, ChannelSchemas, getMessageCreatorsNoId, MessageHooks, messageInChannel } from "../stream";
import { EventEmitter } from 'node:events';
import { KeysOfUnion } from "../utils";

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
export type ComponentHandlerFunction<Config extends AnyComponentConfig, FailureReason extends string> =
    (component: ComponentAPI<Config, FailureReason>) => (msg: MessageResult<InMessage<Config>>) => Promise<ComponentHandlerResult<FailureReason>>;

export interface ComponentConfig<Name extends string, InputSchema extends AnyChannelSchema, OutputSchema extends AnyChannelSchema> {
    readonly name: Name;
    readonly inputChannels: {
        [N in InputSchema['name']]: InputSchema;
    }
    readonly outputChannels: {
        [N in OutputSchema['name']]: OutputSchema;
    }
}
export type AnyComponentConfig = ComponentConfig<string, AnyChannelSchema, AnyChannelSchema>;
export type ComponentMessageCreators<C extends AnyComponentConfig, N extends ComponentChannelNames<C, CT>, CT extends ChannelType> = {
    [Tag in ComponentTags<ComponentChannelSchemas<C, CT>>]: MessageCreatorNoId<ChannelSchemas<ComponentChannelSchema<C, N, CT>, Tag>>;
}
export type Component<Name extends string, Config extends AnyComponentConfig, FailureReason extends string> = {
    readonly messages: {
        recv: (traceId: TraceId) => {
            [N in ComponentChannelNames<Config, 'In'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'In'>;
        },
        send: (traceId: TraceId) => {
            [N in ComponentChannelNames<Config, 'Out'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'Out'>;
        },
    };
    readonly recvRaw: (message: IncomingMessage<AnyMessage>) => void;
    readonly handler: ComponentHandlerFunction<Config, FailureReason>;
    readonly inbox: Observable<MessageResult<InMessage<Config>>>;
    readonly outbox: Observable<MessageResult<OutMessage<Config>>>;
    readonly stop: () => Promise<void>;
} & ComponentConfig<Name, ComponentChannels<Config, 'In'>, ComponentChannels<Config, 'Out'>>;

export type AnyComponent = Component<string, AnyComponentConfig, string>;

export type ComponentAPI<Config extends AnyComponentConfig, FR extends string> = {
    send: {
        [N in ComponentChannelNames<Config, 'Out'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'Out'>;
    },
    success: () => ComponentHandlerSuccess;
    failure: (reason: FR, message: string) => ComponentHandlerFailure<FR>;
}

type ChannelType = 'In' | 'Out';
type ComponentChannelKey<CT extends ChannelType> =
    CT extends 'In' ? 'inputChannels' : 'outputChannels';
export type ComponentChannelNames<C extends AnyComponentConfig, CT extends ChannelType> =
    KeysOfUnion<C[ComponentChannelKey<CT>]>;
type ComponentChannelSchema<C extends AnyComponentConfig, N extends ComponentChannelNames<C, CT>, CT extends ChannelType> =
    C[ComponentChannelKey<CT>][N];
type ComponentChannelSchemas<C extends AnyComponentConfig, CT extends ChannelType> =
    C[ComponentChannelKey<CT>][KeysOfUnion<C[ComponentChannelKey<CT>]>];
type ComponentTags<C extends AnyChannelSchema> = KeysOfUnion<C['schemas']>;
export type ComponentType<C extends AnyComponentConfig, FR extends string> = Component<C['name'], C, FR>;
type InMessage<C extends AnyComponentConfig> = MessageType<ChannelSchemas<ComponentChannelSchemas<C, 'In'>>>;
type OutMessage<C extends AnyComponentConfig> = MessageType<ChannelSchemas<ComponentChannelSchemas<C, 'Out'>>>;

type ComponentChannels<C extends AnyComponentConfig, CT extends ChannelType> =
    C[ComponentChannelKey<CT>][KeysOfUnion<C[ComponentChannelKey<CT>]>];
type ComponentMessageSchemas<C extends AnyComponentConfig, CT extends ChannelType> =
    ComponentChannels<C, CT>['schemas'][KeysOfUnion<ComponentChannels<C, CT>['schemas']>];

export type ComponentMessageType<C extends AnyComponentConfig, CT extends ChannelType> =
    MessageType<ComponentMessageSchemas<C, CT>>;

export function createComponent<C extends AnyComponentConfig, FR extends string>(
    config: C,
    handler: ComponentHandlerFunction<C, FR>,
): ComponentType<C, FR> {

    type InResult = MessageResult<InMessage<C>> & { traceId: TraceId };
    type OutResult = MessageResult<OutMessage<C>> & { traceId: TraceId };

    const emitter = new EventEmitter();
    const stopper = fromEvent(emitter, 'stop');

    const recv = createComponentChannels<C, 'In', FR>(config, emitter, 'In');
    const send = createComponentChannels<C, 'Out', FR>(config, emitter, 'Out');

    const inbox = fromEvent(emitter, 'in').pipe(
        takeUntil(stopper) as any,
        shareReplay(1e3),
    ) as Observable<InResult>
    const outbox = fromEvent(emitter, 'out').pipe(
        takeUntil(stopper) as any,
        shareReplay(1e3),
    ) as Observable<OutResult>

    const stop = async () => {
        emitter.emit('stop');
        sub.unsubscribe();
        await Promise.all([
            lastValueFrom(inbox, { defaultValue: null }),
            lastValueFrom(outbox, { defaultValue: null })
        ]);
    }

    const recvRaw = (incoming: IncomingMessage<AnyMessage>) => {
        emitter.emit('in', {
            traceId: incoming.traceId,
            aggregateId: incoming.streamName.id,
            ...incoming.message,
        });
    }

    const component: ComponentType<C, FR> = {
        name: config.name,
        inputChannels: config.inputChannels as any,
        outputChannels: config.inputChannels as any,
        messages: { recv, send },
        recvRaw,
        handler,
        inbox,
        outbox,
        stop,
    }

    const createApi: (t: TraceId) => ComponentAPI<C, FR> = traceId => ({
        send: send(traceId),
        success: () => ({ _tag: 'Success', traceId }),
        failure: (reason, message) => ({ _tag: 'Failure', traceId, reason, message }),
    });
    const handle = (msg: InResult) => {
        handler(createApi(msg.traceId));
    }

    const sub = inbox.subscribe({
        next: (msg) => handle(msg),
    });

    return component;
}

function createHooks<Config extends AnyComponentConfig, CT extends ChannelType>(
    config: Config,
    emitter: EventEmitter,
    channelType: CT,
): MessageHooks<ComponentChannelSchemas<Config, CT>> {
    const eventType = channelType === 'In' ? 'in' : 'out';
    const channels = channelType === 'In' ? config.inputChannels : config.outputChannels;
    const hooks = Object.keys(channels).reduce((acc, curr) => {
        const hook = (msg: MessageResult<InMessage<Config>>) => emitter.emit(eventType, msg);
        const hooks = Object.keys(channels[curr].schemas).reduce((acc, _curr) => {
            return { ...acc, [_curr]: { after: [ hook ] } };
        }, {} as any);
        const result: any = {
            ...acc,
            [curr]: hooks,
        };
        return result;
    }, {} as any);
    return hooks;
}

type ComponentSendOrRecv<Config extends AnyComponentConfig, CT extends ChannelType, FR extends string> =
    Component<Config['name'], Config, FR>['messages'][CT extends 'In' ? 'recv' : 'send'];
function createComponentChannels<Config extends AnyComponentConfig, CT extends ChannelType, FR extends string>(
    config: Config,
    emitter: EventEmitter,
    channelType: CT,
): ComponentSendOrRecv<Config, CT, FR> {
    const channels = channelType === 'In' ? config.inputChannels : config.outputChannels;
    const hooks = createHooks<Config, CT>(config, emitter, channelType);
    const componentChannels = Object.keys(channels).reduce((acc, curr) => {
        const channel = channels[curr] as ComponentChannelSchemas<Config, CT>;
        return {
            ...acc,
            [curr]: (traceId: TraceId) => (id: AggregateId) =>
                getMessageCreatorsNoId<ComponentChannelSchemas<Config, CT>>(traceId, id, channel, (hooks as any)[curr]),
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