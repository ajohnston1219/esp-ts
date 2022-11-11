import { z } from 'zod';
import { ComponentMessageType, createComponent } from '..';
import { generateMessageId, generateTraceId, IncomingMessage, Message, MessagePayload } from '../../message';
import { generateId } from '../../stream';
import { KeysOfUnion } from '../../utils';

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

        type Msg = ComponentMessageType<typeof component, 'In'>;
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
                expect(msg._tag).toBe('Pong');
            }
        });
        inSub.unsubscribe();
        outSub.unsubscribe();
        await component.stop();
    })
})

function createPingPongComponentConfig() {
    const pingSchema = {
        service: 'my-service',
        name: 'ping' as const,
        schemas: {
            ping: { _tag: 'Ping' as const, schema: z.undefined() },
        },
    }
    const pongSchema = {
        service: 'my-service',
        name: 'pong' as const,
        schemas: {
            pong: { _tag: 'Pong' as const, schema: z.undefined() },
        },
    }
    const componentConfig = {
        name: 'my-component' as const,
        inputChannels: {
            'ping': pingSchema,
        },
        outputChannels: {
            'pong': pongSchema,
        },
    }

    return componentConfig;
}