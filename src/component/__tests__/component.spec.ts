import { z } from 'zod';
import { createComponent } from '..';

describe('Component', () => {
    it('Properly creates component definition', () => {
        // Arrange
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
        const component = createComponent(componentConfig);

        // Act
        component.messages.recv.ping.ping();
        component.messages.send.pong.pong();

        // Assert
        const inbox = component.getInbox();
        expect(inbox.length).toBe(1);
        expect(inbox[0]._tag).toBe('Ping');
        const outbox = component.getOutbox();
        expect(outbox.length).toBe(1);
        expect(outbox[0]._tag).toBe('Pong');
    })
})