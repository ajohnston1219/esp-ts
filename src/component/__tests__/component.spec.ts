import { lastValueFrom } from 'rxjs';
import { createComponent } from '..';
import { generateMessageId, generateTraceId, IncomingMessage, Message } from '../../message';
import { generateId } from '../../stream';
import { createPingPongComponentConfig } from '../../utils/tests';

describe('Component', () => {

    it('Properly creates component definition', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const config = createPingPongComponentConfig();
        const component = createComponent(config, (c) => async ({ message: msg }) => {
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
        component.messages.recv(traceId).ping(id).Ping();

        // Assert
        const inSub = component.inbox.subscribe({
            next: ({ traceId, message, streamName: { id } }) => {
                expect(traceId).toBe(traceId);
                expect(id).toBe(id);
                expect(message._tag).toBe('Ping');
            }
        });
        const outSub = component.outbox.subscribe({
            next: ({ traceId, message, streamName: { id } }) => {
                expect(traceId).toBe(traceId);
                expect(id).toBe(id);
                expect(message._tag).toBe('Pong');
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
        const component = createComponent(config, (c) => async ({ traceId, message, streamName: { id } }) => {
            switch (message._tag) {
                case 'Ping':
                    c.send.pong(id).Pong();
                    return c.success();
                case 'PingMultiple':
                    c.send.pong(id).PongMultiple(message.payload);
                    return c.success();
            }
        });

        const rawMessage: IncomingMessage<Message<'Ping', undefined>> = {
            id: generateMessageId(),
            version: 0,
            streamName: { service: 'my-service', channel: 'ping', id },
            traceId,
            message: { _tag: 'Ping', payload: undefined },
        }

        // Act
        component.recvRaw(rawMessage);

        // Assert
        const inSub = component.inbox.subscribe({
            next: ({ message, traceId, streamName: { id } }) => {
                expect(traceId).toBe(traceId);
                expect(id).toBe(id);
                expect(message._tag).toBe('Ping');
            }
        });
        const outSub = component.outbox.subscribe({
            next: ({ message, traceId, streamName }) => {
                expect(traceId).toBe(traceId);
                expect(id).toBe(id);
                expect(streamName.service).toBe('my-service');
                expect(streamName.channel).toBe('pong');
                expect(message._tag).toBe('Pong');
            }
        });
        inSub.unsubscribe();
        outSub.unsubscribe();
        await component.stop();
    })

    it('Properly handles creating messages without sending/receiving', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const config = createPingPongComponentConfig();
        const component = createComponent(config, (c) => async ({ message: msg }) => {
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
        const ping = component.messages.create.recv(traceId).ping(id).Ping();
        const pong = component.messages.create.send(traceId).pong(id).Pong();

        // Assert
        const inSub = component.inbox.subscribe({
            next: () => expect(false).toBe(true), // Should not get any messages
        });
        const outSub = component.outbox.subscribe({
            next: () => expect(false).toBe(true), // Should not send any messages
        });
        inSub.unsubscribe();
        outSub.unsubscribe();
        await component.stop();
        const inResult = await lastValueFrom(component.inbox, { defaultValue: null });
        const outResult = await lastValueFrom(component.outbox, { defaultValue: null });

        expect(inResult).toBeNull();
        expect(outResult).toBeNull();
        expect(ping.message._tag).toBe('Ping');
        expect(ping.streamName.id).toBe(id);
        expect(ping.traceId).toBe(traceId);
        expect(pong.message._tag).toBe('Pong');
        expect(pong.streamName.id).toBe(id);
        expect(pong.traceId).toBe(traceId);
    })
})