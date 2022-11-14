import { lastValueFrom } from 'rxjs';
import { z } from 'zod';
import { ComponentChannelSchema, ComponentMessageSchema, ComponentMessageTags, createComponent, InMessage } from '..';
import { AnyMessageSchema, generateMessageId, generateTraceId, IncomingMessage, Message, MessageSchema, MessageSchemaMap, MessageTag, MessageType } from '../../message';
import { WrapDefinition } from '../../schema';
import { generateId } from '../../stream';
import { createPingPongComponentConfig } from '../../utils/tests';

describe('Component', () => {

    it('Properly creates component definition', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const config = createPingPongComponentConfig();
        type C = typeof config;
        type _IM = InMessage<C>;
        type _MS = ComponentMessageSchema<C, 'In', 'ping'>;
        type _WD = WrapDefinition<_MS>;
        const z1 = z.object({
            _tag: z.literal('One'),
            payload: z.number(),
        })
        const z2 = z.object({
            _tag: z.literal('Two'),
            payload: z.string(),
        })
        type _ZT = typeof z1 | typeof z2;
        type _ZTT = z.infer<_ZT>;
        type _MTG = z.infer<_WD>;
        type _MTT = Message<_MS['_tag'], _MS['schema']>;
        type _MT = MessageType<ComponentMessageSchema<C, 'In', 'ping'>>;
        type _CMS = ComponentChannelSchema<C, 'ping', 'In'>['schema'][ComponentMessageTags<C, 'In', 'ping'>];
        type infer<S extends AnyMessageSchema> = {};
        type _MST = C['inputChannels']['ping']['schema'][ComponentMessageTags<C, 'In', 'ping'>];
        const component = createComponent(config, (c) => async (msg) => {
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
        component.messages.recv(traceId).ping(id).PingMultiple(0);

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
                    c.send.pong(id).Pong();
                    return c.success();
                case 'PingMultiple':
                    c.send.pong(id).PongMultiple(msg.payload);
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

    it('Properly handles creating messages without sending/receiving', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const config = createPingPongComponentConfig();
        const component = createComponent(config, (c) => async (msg) => {
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
        expect(ping._tag).toBe('Ping');
        expect(ping.aggregateId).toBe(id);
        expect(ping.traceId).toBe(traceId);
        expect(pong._tag).toBe('Pong');
        expect(pong.aggregateId).toBe(id);
        expect(pong.traceId).toBe(traceId);
    })
})