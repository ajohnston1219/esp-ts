import { z } from "zod";
import { define } from "..";
import { defineChannel } from "../channel";
import { createHandler, createSubscription } from '../subscription';

describe('Subscription', () => {

    it('properly creates a subscription', async () => {
        // Arrange
        const pingChannelSchema = defineChannel('my-service', 'ping',
            define('Ping', z.void()),
            define('PingMultiple', z.number().positive()),
        );
        const pongChannelSchema = defineChannel('my-service', 'pong',
            define('Pong', z.void()),
            define('PongMultiple', z.number().positive()),
        );
        const otherChannelSchema = defineChannel('my-service', 'other',
            define('Other', z.number()),
            define('Other_2', z.number()),
        );
        const pingHandler = createHandler({
            tag: 'Ping',
            input: pingChannelSchema,
            outputs: {
                output: [
                    { _tag: 'pong', schema: pongChannelSchema.schema.Pong },
                ],
                failures: ['NoPaddle'],
            },
            execute: (api) => async (incoming) => {
                api.send.pong(incoming.streamName.id).Pong();
                return api.success();
            },
        });
        const pingMultiHandler = createHandler({
            tag: 'PingMultiple',
            input: pingChannelSchema,
            outputs: {
                output: [
                    { _tag: 'pong', schema: pongChannelSchema.schema.PongMultiple },
                    { _tag: 'other', schema: otherChannelSchema.schema.Other },
                ],
                failures: ['NoPaddle'],
            },
            execute: (api) => async (incoming) => {
                api.send.pong(incoming.streamName.id).PongMultiple(incoming.message.payload);
                return api.success();
            },
        });

        const sub = createSubscription(pingChannelSchema, [pongChannelSchema, otherChannelSchema], {
            Ping: pingHandler,
            PingMultiple: pingMultiHandler,
        });

        // Act
        console.log('sub', sub);

        // Assert
    })

})