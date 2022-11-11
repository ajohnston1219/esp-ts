import { ComponentMessageType, createComponent } from '..';
import { generateMessageId, generateTraceId, IncomingMessage, Message, MessagePayload } from '../../message';
import { generateId } from '../../stream';
import { createPingPongComponentConfig } from '../../utils/tests';

describe('Component', () => {

    it('Properly creates component definition', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const config = createPingPongComponentConfig();
        const component = createComponent(config, (c) => async (msg) => {
            switch (msg._tag) {
                case 'Ping':
                    c.send.pong(id).pong();
                    return c.success();
            }
        });

        // Act
        component.messages.recv(traceId).ping(id).ping();

        // Assert
        const inSub = component.inbox.subscribe({
            next: (msg) => {
                expect(msg.traceId).toBe(traceId);
                expect(msg.aggregateId).toBe(id);
                expect(msg._tag).toBe('Ping');
            }
        });
        const outSub = component.outbox.subscribe({
            next: (msg) => {
                expect(msg.traceId).toBe(traceId);
                expect(msg.aggregateId).toBe(id);
                expect(msg._tag).toBe('Pong');
            }
        });
        inSub.unsubscribe();
        outSub.unsubscribe();
        await component.stop();
    })

    it('Properly handles raw messages', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const config = createPingPongComponentConfig();
        const component = createComponent(config, (c) => async (msg) => {
            switch (msg._tag) {
                case 'Ping':
                    c.send.pong(id).pong();
                    return c.success();
            }
        });

        const rawMessage: IncomingMessage<Message<'Ping', undefined>> = {
            id: generateMessageId(),
            version: 0,
            streamName: { service: 'my-service', channel: 'ping', id },
            traceId,
            message: { _tag: 'Ping' },
        }

        // Act
        component.recvRaw(rawMessage);

        // Assert
        const inSub = component.inbox.subscribe({
            next: (msg) => {
                expect(msg.traceId).toBe(traceId);
                expect(msg.aggregateId).toBe(id);
                expect(msg._tag).toBe('Ping');
            }
        });
        const outSub = component.outbox.subscribe({
            next: (msg) => {
                expect(msg.traceId).toBe(traceId);
                expect(msg.aggregateId).toBe(id);
                expect(msg.service).toBe('my-service');
                expect(msg.channel).toBe('pong');
                expect(msg._tag).toBe('Pong');
            }
        });
        inSub.unsubscribe();
        outSub.unsubscribe();
        await component.stop();
    })
})