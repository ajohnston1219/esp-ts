import { concatMap, fromEvent, lastValueFrom, Observable, shareReplay, takeUntil } from "rxjs";
import { defineMessage, IncomingMessage, MessageResult, MessageType, NoMessageSchema, OutgoingMessage, TraceId } from "../message";
import { EventEmitter } from 'node:events';
import { AnyChannelSchema, ChannelNames, ChannelSchema, ChannelSchemas } from "../schema/channel";
import { TaggedArray, TaggedMap, TaggedObject } from "../schema/tagged";
import { AnySubscription, AnySubscriptionHandler, getSubscriptionAPI } from "../schema/subscription";
import { z } from "zod";

export type ComponentChannels<C extends AnyChannelSchema> = TaggedMap<TaggedObject<C['name'], C>>;
export type IgnoreChannel = ChannelSchema<'__IGNORE__', NoMessageSchema, '__LOCAL__'>;
export const ignoreChannel = (): ComponentChannels<IgnoreChannel> => ({
    '__IGNORE__': ['__IGNORE__', {
        service: '__LOCAL__',
        name: '__IGNORE__',
        schemas: [
            defineMessage('__IGNORE__', z.undefined()),
        ],
    }]
});

export type ComponentSubscriptions<S extends AnySubscription<In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema> =
    TaggedArray<TaggedObject<S['name'], S>>;

export interface ComponentConfig<Name extends string, In extends AnyChannelSchema, Out extends AnyChannelSchema> {
    readonly name: Name;
    readonly inputChannels: ComponentChannels<In>;
    readonly outputChannels: ComponentChannels<Out>;
    readonly subscriptions: ComponentSubscriptions<AnySubscription<In, Out>, In, Out>;
}

export type Component<Config extends ComponentConfig<string, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, FailureReason extends string> = {
    readonly config: Config;
    readonly recv: (message: IncomingMessage<MessageType<ChannelSchemas<In>>>) => void;
    readonly send: (message: OutgoingMessage<MessageType<ChannelSchemas<Out>>>) => void;
    readonly inbox: Observable<MessageResult<MessageType<ChannelSchemas<In>>>>;
    readonly outbox: Observable<MessageResult<MessageType<ChannelSchemas<Out>>>>;
    readonly stop: () => Promise<void>;
};

export function createComponent<N extends string, C extends ComponentConfig<N, In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema, FR extends string, CanSend extends boolean = true>(
    config: C,
): Component<C, In, Out, FR> {

    type Incoming = IncomingMessage<MessageType<ChannelSchemas<In>>>;
    type Outgoing = OutgoingMessage<MessageType<ChannelSchemas<Out>>>;

    const emitter = new EventEmitter({ captureRejections: true });
    const stopper = fromEvent(emitter, 'stop');

    const recv = (message: Incoming) => {
        emitter.emit('in', message);
    }
    const send = (message: Outgoing) => {
        emitter.emit('out', message);
    }

    // TODO(adam): Encapsulate into subscription module
    const getSubscription = (service: string, channel: ChannelNames<In>): AnySubscription<In, Out> | undefined => {
        const f = ([_, { input }]: ComponentSubscriptions<AnySubscription<In, Out>, In, Out>[number]) => {
            return input.service === service && input.name === channel;
        }
        const found = config.subscriptions.find(f);
        return found ? found[1] : undefined;
    };

    // TODO(adam): Track results
    const handleMessage = async (incoming: Incoming) => {
        const { traceId } = incoming;
        const { service, channel } = incoming.streamName;
        const { _tag } = incoming.message;
        const sub = getSubscription(service, channel);
        if (sub && _tag in sub.handle) {
            const handler = sub.handle[_tag] as AnySubscriptionHandler<In, Out>;
            const api = getSubscriptionAPI(traceId, _tag, sub);
            await handler.execute(api)(incoming);
        }
    }

    const inbox = fromEvent(emitter, 'in').pipe(
        takeUntil(stopper) as any,
        shareReplay(1e3),
    ) as Observable<Incoming>
    const outbox = fromEvent(emitter, 'out').pipe(
        takeUntil(stopper) as any,
        shareReplay(1e3),
    ) as Observable<Outgoing>

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
        recv,
        send,
        inbox,
        outbox,
        stop,
    }

    return component;
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

export type AnyComponentConfig = ComponentConfig<string, AnyChannelSchema, AnyChannelSchema>;
export type SomeComponentConfig<In extends AnyChannelSchema, Out extends AnyChannelSchema> =
    ComponentConfig<string, In, Out>;
export type AnyComponent = Component<AnyComponentConfig, AnyChannelSchema, AnyChannelSchema, string>;
export type SomeComponent<In extends AnyChannelSchema, Out extends AnyChannelSchema> = Component<SomeComponentConfig<In, Out>, In, Out, string>;