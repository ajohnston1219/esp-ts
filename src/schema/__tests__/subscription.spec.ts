import { z } from "zod";
import { AnyMessage, defineMessage, generateTraceId, MessageResult } from "../../message";
import { generateId } from "../../stream";
import { defineChannel } from "../channel";
import { createHandler, createSubscription, getSubscriptionAPI } from '../subscription';

describe('Subscription', () => {

    it('properly creates a subscription', async () => {
        // Arrange
        const pingMessage = defineMessage('Ping', z.void());
        const pingMultiMessage = defineMessage('PingMultiple', z.number());
        const pingChannel = defineChannel('my-service', 'ping', pingMessage, pingMultiMessage);

        const pongMessage = defineMessage('Pong', z.void());
        const pongMultiMessage = defineMessage('PongMultiple', z.number());
        const pongChannel = defineChannel('my-service', 'pong', pongMessage, pongMultiMessage);

        const otherMessage = defineMessage('Other', z.number());
        const otherMessage_2 = defineMessage('Other_2', z.number());
        const otherChannel = defineChannel('my-service', 'other', otherMessage, otherMessage_2);

        const pingHandler = createHandler({
            message: pingMessage,
            input: pingChannel,
            outputs: {
                output: [
                    [ pongChannel, [ pongMessage ]],
                ],
                failures: ['NoPaddle'],
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
                failures: ['NoPaddle'],
            },
            execute: (api) => async (incoming) => {
                api.send.pong(incoming.streamName.id).PongMultiple(incoming.message.payload);
                return api.success();
            },
        });

        const sub = createSubscription('ping-pong', pingChannel, [pongChannel, otherChannel], {
            Ping: pingHandler,
            PingMultiple: pingMultiHandler,
        });

        const id = generateId();
        const messageId = generateId();
        const tId = generateTraceId();
        const received: MessageResult<AnyMessage>[] = [];
        const api = getSubscriptionAPI(tId, 'Ping', sub, {
            after: [msg => received.push(msg)],
        });

        // Act
        await sub.handle.Ping.execute(api)({
            id: messageId, traceId: tId, version: 0,
            streamName: { service: '__LOCAL__', channel: 'ping', id },
            message: { _tag: 'Ping', payload: undefined },
        });

        // Assert
        expect(received.length).toBe(1);
        const { traceId, message, streamName } = received[0];
        expect(traceId).toBe(tId);
        expect(message).toStrictEqual({ _tag: 'Pong' });
        expect(streamName).toStrictEqual({ service: 'my-service', channel: 'pong', id });
    })

})