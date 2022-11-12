import { fromEvent, lastValueFrom, Observable, shareReplay, takeUntil } from "rxjs";
import { AnyMessage, IncomingMessage, MessageCreatorNoId, MessageResult, MessageType, TraceId } from "../message";
import { AggregateId, AnyChannelSchema, ChannelSchemas, getMessageCreatorsNoId, MessageHooks } from "../stream";
import { EventEmitter } from 'node:events';
import { KeysOfUnion } from "../utils/types";

export interface ComponentConfig<Name extends string, InputSchema extends AnyChannelSchema, OutputSchema extends AnyChannelSchema> {
    readonly name: Name;
    readonly inputChannels: {
        [N in InputSchema['name']]: InputSchema;
    }
    readonly outputChannels: {
        [N in OutputSchema['name']]: OutputSchema;
    }
}

export type ComponentBuildResult<Config extends AnyComponentConfig, FailureReason extends string> = {
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
};

export type Component<Config extends AnyComponentConfig, FailureReason extends string> = Config & ComponentBuildResult<Config, FailureReason>;

export function createComponent<C extends AnyComponentConfig, FR extends string>(
    config: C,
    handler: ComponentHandlerFunction<C, FR>,
): Component<C, FR> {

    type InResult = MessageResult<InMessage<C>>;
    type OutResult = MessageResult<OutMessage<C>>;

    const emitter = new EventEmitter({ captureRejections: true });
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

    const recvRaw = (incoming: IncomingMessage<AnyMessage>) => {
        emitter.emit('in', {
            traceId: incoming.traceId,
            aggregateId: incoming.streamName.id,
            ...incoming.message,
        });
    }

    const inSub = inbox.subscribe({
        next: (msg) => handle(msg),
    });
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

    const component: Component<C, FR> = {
        ...config,
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
        handler(createApi(msg.traceId))(msg);
    }

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
        const schema = channels[curr];
        type MessageType = CT extends 'In' ? InMessage<Config> : OutMessage<Config>;
        const getMessage = (msg: MessageResult<MessageType>) => channelType === 'In'
            ? msg
            : { ...msg, channel: schema.name, service: schema.service };
        const hook = (msg: MessageResult<MessageType>) => {
            emitter.emit(eventType, getMessage(msg));
        }
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
    Component<Config, FR>['messages'][CT extends 'In' ? 'recv' : 'send'];
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
export type ComponentAPI<Config extends AnyComponentConfig, FR extends string> = {
    send: {
        [N in ComponentChannelNames<Config, 'Out'>]: (id: AggregateId) => ComponentMessageCreators<Config, N, 'Out'>;
    },
    success: () => ComponentHandlerSuccess;
    failure: (reason: FR, message: string) => ComponentHandlerFailure<FR>;
}
export type ComponentHandlerFunction<Config extends AnyComponentConfig, FailureReason extends string> =
    (component: ComponentAPI<Config, FailureReason>) => (msg: MessageResult<InMessage<Config>>) => Promise<ComponentHandlerResult<FailureReason>>;

export type ComponentMessageCreators<C extends AnyComponentConfig, N extends ComponentChannelNames<C, CT>, CT extends ChannelType> = {
    [Tag in ComponentTags<ComponentChannelSchemas<C, CT>>]: MessageCreatorNoId<ChannelSchemas<ComponentChannelSchema<C, N, CT>, Tag>>;
}
export type AnyComponentConfig = ComponentConfig<string, AnyChannelSchema, AnyChannelSchema>;
export type AnyComponent = Component<AnyComponentConfig, string>;

type ChannelType = 'In' | 'Out';
type ComponentChannelKey<CT extends ChannelType> =
    CT extends 'In' ? 'inputChannels' : 'outputChannels';
export type ComponentChannelNames<C extends AnyComponentConfig, CT extends ChannelType> =
    KeysOfUnion<C[ComponentChannelKey<CT>]>;
export type ComponentServiceNames<C extends AnyComponentConfig, CT extends ChannelType> =
    C[ComponentChannelKey<CT>][ComponentChannelNames<C, CT>]['service'];
type ComponentChannelSchema<C extends AnyComponentConfig, N extends ComponentChannelNames<C, CT>, CT extends ChannelType> =
    C[ComponentChannelKey<CT>][N];
export type ComponentChannelSchemas<C extends AnyComponentConfig, CT extends ChannelType> =
    C[ComponentChannelKey<CT>][KeysOfUnion<C[ComponentChannelKey<CT>]>];
export type ComponentTags<C extends AnyChannelSchema> = KeysOfUnion<C['schemas']>;
export type ComponentMessageTags<C extends AnyChannelSchema> = C['schemas'][ComponentTags<C>]['_tag'];
export type ComponentType<C extends AnyComponentConfig, FR extends string> = Component<C, FR>;

export type ComponentMessageSchemas<C extends AnyComponentConfig, CT extends ChannelType> =
    ComponentChannelSchemas<C, CT>['schemas'][ComponentTags<ComponentChannelSchemas<C, CT>>];
export type ComponentMessageType<C extends AnyComponentConfig, CT extends ChannelType> =
    MessageType<ComponentMessageSchemas<C, CT>>;
type InMessage<C extends AnyComponentConfig> = ComponentMessageType<C, 'In'>;
type OutMessage<C extends AnyComponentConfig> =
    ComponentMessageType<C, 'Out'>
    & { channel: ComponentChannelNames<C, 'Out'>, service: ComponentServiceNames<C, 'Out'> };
