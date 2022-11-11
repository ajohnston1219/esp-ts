import { InMemoryMessageStoreDB, MessageStore } from '..';
import { AnyComponent, AnyComponentConfig, Component, ComponentChannelSchemas, ComponentTags, ComponentType, createComponent } from '../../component';
import { generateTraceId, TraceId } from '../../message';
import { generateId } from '../../stream';
import { createPingPongComponentConfig, delay, nextTick } from '../../utils/tests';

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
        const config = createPingPongComponentConfig();
        const component = createComponent(config, (c) => async (msg) => {
            switch (msg._tag) {
                case 'Ping':
                    c.send.pong(msg.aggregateId).pong();
                    return c.success();
            }
        });

        // Act
        await messageStore.logMessage({
            traceId,
            streamName: { service: 'my-service', channel: 'ping', id },
            message: { _tag: 'Ping' },
        });
        messageStore.bindComponent(component);
        await nextTick();
        await component.stop();

        // Assert
        const messages = await messageStore.getTrace(traceId);
        expect(messages.length).toBe(2);
        expect(messages[0].message._tag).toBe('Ping');
        expect(messages[1].message._tag).toBe('Pong');
    });

})
