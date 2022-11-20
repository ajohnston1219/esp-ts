import { InMemoryMessageStoreDB, MessageStore } from '..';
import { generateTraceId } from '../../message';
import { generateId } from '../../stream';
import { getPingPongComponentCreator, delay, nextTick } from '../../utils/tests';

describe('Message Store Bound Components', () => {

    let messageStore: MessageStore;
    beforeEach(() => {
        const db = InMemoryMessageStoreDB.create();
        messageStore = MessageStore.create(db);
    });

    it('properly handles and logs component messages', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const create = getPingPongComponentCreator();

        // TODO(adam): Fix type inference here
        const component = create((c) => async ({ message: msg, streamName: { id } }) => {
            switch (msg._tag) {
                case 'Ping':
                    c.send.pong(id).Pong();
                    return c.success();
                case 'PingMultiple':
                    c.send.pong(id).PongMultiple(msg.payload);
                    return c.success();
            }
        });

        // Act
        await messageStore.logMessage({
            traceId,
            streamName: { service: 'my-service', channel: 'ping', id },
            message: { _tag: 'Ping', payload: undefined },
        });
        messageStore.bindComponent(component);
        await nextTick();
        await component.stop();

        // Assert
        const messages = await messageStore.getTrace(traceId);
        expect(messages.length).toBe(2);
        expect(messages[0].message._tag).toBe('Ping');
        expect(messages[0].traceId).toBe(traceId);
        expect(messages[0].streamName).toStrictEqual({ service: 'my-service', channel: 'ping', id });
        expect(messages[1].message._tag).toBe('Pong');
        expect(messages[1].traceId).toBe(traceId);
        expect(messages[1].streamName).toStrictEqual({ service: 'my-service', channel: 'pong', id });
    });

})
