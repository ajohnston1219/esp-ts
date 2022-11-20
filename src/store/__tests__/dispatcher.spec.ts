import { InMemoryMessageStoreDB, MessageStore } from "..";
import { generateTraceId, IncomingMessage, Message, OutgoingMessage } from "../../message";
import { AggregateId, Channel, generateId, messageInChannel } from "../../stream";
import { Dispatcher, HandlerFunction } from "../dispatcher";
import { getPingPongComponentCreator, nextTick } from "../../utils/tests";
import { AnyMessageSchemaArray, createHandler, createSubscription, InOutMap } from "../../schema/subscription";
import { ChannelSchemas } from "../../schema/channel";
import { Component, ComponentConfig } from "../../component";

const createChannel = (channel: string) => ({ channel, service: 'my-service' });

type AddEvent = Message<'Add', number>;
const addEvent = (payload: number): AddEvent => ({
    _tag: 'Add',
    payload,
});
type SubtractEvent = Message<'Subtract', number>;
const subtractEvent = (payload: number): SubtractEvent => ({
    _tag: 'Subtract',
    payload,
});
type MathEvent = AddEvent | SubtractEvent;

const channel = {
    service: 'my-service',
    channel: 'math',
}
const mathStream = (id: AggregateId) => ({ ...channel, id });
const mathMessage = (message: MathEvent): OutgoingMessage<MathEvent> => ({
    traceId: generateTraceId(),
    streamName: mathStream(generateId()),
    message,
})

describe('Dispatcher', () => {

    let messageStore: MessageStore;
    beforeEach(() => {
        const db = InMemoryMessageStoreDB.create();
        messageStore = MessageStore.create(db);
    });

    it('properly subscribes to the correct channel', async () => {
        // Arrange
        const consumed: IncomingMessage<MathEvent>[] = [];
        const channel = createChannel('my-channel');
        const otherChannel = createChannel('other-channel');
        const createMessage = (message: MathEvent, channel: Channel): OutgoingMessage<MathEvent> => ({
            traceId: generateTraceId(),
            streamName: { ...channel, id: generateId() },
            message,
        })
        const handler: HandlerFunction<MathEvent> = async (incoming) => {
            switch (incoming.message._tag) {
                case 'Add':
                case 'Subtract':
                    consumed.push(incoming);
            }
        }
        for (let i = 0; i < 10; ++i) {
            messageStore.logMessage(createMessage(addEvent(i), channel));
            messageStore.logMessage(createMessage(addEvent(i), otherChannel));
        }
        const dispatcher = Dispatcher.create([channel], handler);

        // Act
        messageStore.bindDispatcher(dispatcher);
        await nextTick();

        // Assert
        expect(consumed.length).toBe(10);
        consumed.forEach(msg => {
            expect(msg.streamName.channel).toBe(channel.channel);
        })
    });

    it('properly restores a dispatcher subscription', async () => {
        // Arrange
        const consumed: IncomingMessage<MathEvent>[] = [];
        const channel = createChannel('my-channel');
        const otherChannel = createChannel('other-channel');
        const createMessage = (message: MathEvent, channel: Channel): OutgoingMessage<MathEvent> => ({
            traceId: generateTraceId(),
            streamName: { ...channel, id: generateId() },
            message,
        })
        const handler: HandlerFunction<MathEvent> = async (incoming) => {
            switch (incoming.message._tag) {
                case 'Add':
                case 'Subtract':
                    consumed.push(incoming);
            }
        }
        for (let i = 0; i < 10; ++i) {
            messageStore.logMessage(createMessage(addEvent(i), channel));
            messageStore.logMessage(createMessage(addEvent(i), otherChannel));
        }
        const dispatcher = Dispatcher.restore([{ channel, offset: 5 }], handler);

        // Act
        messageStore.bindDispatcher(dispatcher);
        await nextTick();

        // Assert
        expect(consumed.length).toBe(5);
        consumed.forEach((msg, i) => {
            expect(msg.streamName.channel).toBe(channel.channel);
            expect(msg.message.payload).toBe(i + 5);
        })
    });

    it('properly restores a dispatcher subscription (multiple subs)', async () => {
        // Arrange
        const consumed: IncomingMessage<MathEvent>[] = [];
        const otherConsumed: IncomingMessage<MathEvent>[] = [];
        const channel = createChannel('my-channel');
        const otherChannel = createChannel('other-channel');
        const createMessage = (message: MathEvent, channel: Channel): OutgoingMessage<MathEvent> => ({
            traceId: generateTraceId(),
            streamName: { ...channel, id: generateId() },
            message,
        })
        const handler: HandlerFunction<MathEvent> = async (incoming) => {
            switch (incoming.message._tag) {
                case 'Add':
                case 'Subtract':
                    if (messageInChannel(incoming, channel)) {
                        consumed.push(incoming);
                    } else {
                        otherConsumed.push(incoming);
                    }
            }
        }
        for (let i = 0; i < 10; ++i) {
            messageStore.logMessage(createMessage(addEvent(i), channel));
            messageStore.logMessage(createMessage(addEvent(i), otherChannel));
        }
        const dispatcher = Dispatcher.restore([{ channel, offset: 5 }, { channel: otherChannel, offset: 3 }], handler);

        // Act
        messageStore.bindDispatcher(dispatcher);
        await nextTick();

        // Assert
        expect(consumed.length).toBe(5);
        expect(otherConsumed.length).toBe(7);
        consumed.forEach((msg, i) => {
            expect(msg.streamName.channel).toBe(channel.channel);
            expect(msg.message.payload).toBe(i + 5);
        })
        otherConsumed.forEach((msg, i) => {
            expect(msg.streamName.channel).toBe(otherChannel.channel);
            expect(msg.message.payload).toBe(i + 3);
        })
    });

    it('properly creates dispatcher from a component', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();

        const { create, pingChannel, pongChannel, pingMessage, pingMultiMessage, pongMessage, pongMultiMessage } = getPingPongComponentCreator();
        const pingHandler = createHandler({
            message: pingMessage,
            input: pingChannel,
            outputs: {
                output: [
                    [ pongChannel, [ pongMessage ] ],
                ],
                failures: [ 'NoPaddle' ],
            },
            execute: (api) => async (incoming) => {
                api.send.pong(incoming.streamName.id).Pong();
                return api.success();
            },
        });
        const pingMultiHandler = createHandler({
            message: pingMultiMessage,
            input: pingChannel,
            outputs: {
                output: [
                    [ pongChannel, [ pongMultiMessage ] ],
                ],
                failures: [ 'NoPaddle' ],
            },
            execute: (api) => async (incoming) => {
                api.send.pong(incoming.streamName.id).PongMultiple(incoming.message.payload);
                return api.success();
            },
        });

        const pingPongSubscription = createSubscription('ping-pong', pingChannel, [pongChannel], {
            Ping: pingHandler,
            PingMultiple: pingMultiHandler,
        })

        const component = create([pingPongSubscription]);
        // TODO(adam): Type inference here
        const dispatcher = Dispatcher.fromComponent(component);
        await messageStore.logMessage({
            traceId,
            streamName: { service: 'my-service', channel: 'ping', id },
            message: { _tag: 'Ping', payload: undefined },
        });

        // Act
        messageStore.bindDispatcher(dispatcher);
        await nextTick();

        // Assert
        const inSub = component.inbox.subscribe({
            next: ({ traceId, streamName, message }) => {
                expect(traceId).toBe(traceId);
                expect(streamName.id).toBe(id);
                expect(message._tag).toBe('Ping');
            }
        });
        const outSub = component.outbox.subscribe({
            next: ({ traceId, streamName, message }) => {
                expect(traceId).toBe(traceId);
                expect(streamName.id).toBe(id);
                expect(message._tag).toBe('Pong');
            }
        });
        inSub.unsubscribe();
        outSub.unsubscribe();
        await component.stop();
    });
});