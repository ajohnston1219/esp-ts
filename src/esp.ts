import { generateTraceId, IncomingMessage, Message, OutgoingMessage } from './message';
import { InMemoryMessageStoreDB, MessageStore } from './store';
import { Dispatcher } from './store/dispatcher';
import { AggregateId, generateId } from './stream';

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

function handleMessage(state: number, message: MathEvent): number {
    switch (message._tag) {
        case 'Add':
            return state + message.amount;
        case 'Subtract':
            return state - message.amount;
    }
}

let state = 0;
const handler = async ({ version, message }: IncomingMessage<MathEvent>) => {
    console.log('version', version);
    console.log('message', message);
    state = handleMessage(state, message);
    console.log('new state', state);
}

const db = InMemoryMessageStoreDB.create();
const messageStore = MessageStore.create(db);
const dispatcher = Dispatcher.create<MathEvent>([channel], handler);
messageStore.logMessage(addMessage(5));
messageStore.logMessage(subtractMessage(2));
messageStore.logMessage(addMessage(7));
messageStore.logMessage(addMessage(3));
messageStore.bind(dispatcher);
messageStore.logMessage(subtractMessage(9));
messageStore.logMessage(subtractMessage(6));
messageStore.logMessage(addMessage(4));

setTimeout(() => messageStore.stopDispatchers(), 5000);