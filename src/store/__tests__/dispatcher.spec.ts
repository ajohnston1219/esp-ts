import { InMemoryMessageStoreDB, MessageStore } from "..";
import { generateTraceId, IncomingMessage, Message, OutgoingMessage } from "../../message";
import { AggregateId, Channel, generateId } from "../../stream";
import { Dispatcher, HandlerFunction } from "../dispatcher";

const createChannel = (channel: string) => ({ channel, service: 'my-service' });

interface AddEvent extends Message<'Add'> {
    readonly amount: number;
}
const addEvent = (amount: number): AddEvent => ({
    _tag: 'Add',
    amount,
});
interface SubtractEvent extends Message<'Subtract'> {
    readonly amount: number;
}
const subtractEvent = (amount: number): SubtractEvent => ({
    _tag: 'Subtract',
    amount,
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
const addMessage = (amount: number) => mathMessage(addEvent(amount));
const subtractMessage = (amount: number) => mathMessage(subtractEvent(amount));

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
        messageStore.bind(dispatcher);
        await delay(1000);

        // Assert
        expect(consumed.length).toBe(10);
        consumed.forEach(msg => {
            expect(msg.streamName.channel).toBe(channel.channel);
        })
    });
});

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}