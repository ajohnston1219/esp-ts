import { AnyComponentConfig, Component, ComponentChannelNames, ComponentMessageType } from "../component";
import { AnyMessage, IncomingMessage, StoredMessage } from "../message";
import { Channel, channelEquals } from "../stream";

export type HandlerFunction<M extends AnyMessage> = (message: IncomingMessage<M>) => Promise<void>;

export interface DispatcherSubscription {
    readonly channel: Channel;
    offset: number;
}

export class Dispatcher<M extends AnyMessage> {
    private constructor(
        private _subscriptions: DispatcherSubscription[],
        private _handler: HandlerFunction<M>,
    ) {}

    public static create<M extends AnyMessage>(
        channels: Channel[],
        handler: HandlerFunction<M>,
    ): Dispatcher<M> {
        return new Dispatcher(channels.map(channel => ({ channel, offset: 0 })), handler);
    }

    public static fromComponent<C extends AnyComponentConfig, FR extends string>(component: Component<C, FR>): Dispatcher<ComponentMessageType<C, 'In', ComponentChannelNames<C, 'In'>>> {
        const handler: HandlerFunction<ComponentMessageType<C, 'In', ComponentChannelNames<C, 'In'>>> = async (message) => {
            component.recvRaw(message);
        }
        const subscriptions: DispatcherSubscription[] = Object.keys(component.config.inputChannels).map(key => {
            const schema = (component.config.inputChannels as any)[key];
            const channel = { channel: schema._tag, service: schema.service };
            return {
                channel,
                offset: 0,
            };
        });
        return new Dispatcher(subscriptions, handler);
    }

    public static restore<M extends AnyMessage>(
        subscriptions: DispatcherSubscription[],
        handler: HandlerFunction<M>
    ): Dispatcher<M> {
        return new Dispatcher(subscriptions, handler);
    }

    public async handle(message: StoredMessage<M>): Promise<void> {
        try {
            await this._handler(message);
        } finally {
            this.setOffset(message.streamName, message.channelVersion);
        }
    }

    public filter(message: StoredMessage<AnyMessage>): message is StoredMessage<M> {
        const { streamName, channelVersion } = message;
        return (
            this.subscriptions.some(({ channel, offset }) => (
                channelEquals(streamName, channel)
                && channelVersion > offset
            ))
        );
    }

    private setOffset(channel: Channel, offset: number): void {
        this._subscriptions = this._subscriptions.map(sub => sub.channel === channel ? { ...sub, offset } : sub);
    }

    private get subscriptions(): DispatcherSubscription[] { return this._subscriptions; }
}