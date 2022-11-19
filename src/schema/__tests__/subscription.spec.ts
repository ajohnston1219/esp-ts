import { z } from "zod";
import { define } from "..";
import { AnyMessage } from "../../message";
import { defineChannel } from "../channel";
import { createHandler, createSubscription, SubscriptionInputMessage } from '../subscription';

describe('Subscription', () => {

    it('properly creates a subscription', async () => {
        // Arrange
        const pingChannel = defineChannel('my-service', 'ping',
            define('Ping', z.void()),
            define('PingMultiple', z.number().positive()),
        );
        const pongChannel = defineChannel('my-service', 'pong',
            define('Pong', z.void()),
            define('PongMultiple', z.number().positive()),
        );
        const otherChannel = defineChannel('my-service', 'other',
            define('Other', z.number()),
            define('Other_2', z.number()),
        );
        const pingHandler = createHandler({
            tag: 'Ping',
            input: pingChannel,
            outputs: {
                output: [
                    [ pongChannel, [
                        pongChannel.schema.Pong,
                        pongChannel.schema.PongMultiple,
                    ]],
                ],
                failures: ['NoPaddle'],
            },
            execute: (api) => async (incoming) => {
                api.send.pong(incoming.streamName.id).PongMultiple(5);
                api.send.pong(incoming.streamName.id).Pong();
                return api.success();
            },
        });
        const pingMultiHandler = createHandler({
            tag: 'PingMultiple',
            input: pingChannel,
            outputs: {
                output: [
                    [ pongChannel, [pongChannel.schema.PongMultiple] ],
                    [ otherChannel, [otherChannel.schema.Other] ],
                ],
                failures: ['NoPaddle'],
            },
            execute: (api) => async (incoming) => {
                api.send.pong(incoming.streamName.id).PongMultiple(incoming.message.payload);
                api.send.other(incoming.streamName.id).Other(incoming.message.payload);
                return api.success();
            },
        });

        const sub = createSubscription(pingChannel, [pongChannel, otherChannel], {
            Ping: pingHandler,
            PingMultiple: pingMultiHandler,
        });

        type IM = SubscriptionInputMessage<typeof pingChannel>;
        type _Is = IM extends AnyMessage ? true : false;

        // Act
        console.log('sub', sub);

        // Assert
    })

})