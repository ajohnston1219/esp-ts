import { z } from 'zod';
import { AnyMessage, Envelope, generateTraceId, MessageResult, MessageType } from '../../message';
import { define } from '../../schema';
import { ChannelMessageType, ChannelTags, defineChannel, generateId, getStreamName } from '../../stream';
import { defineHandler, defineHandlerInput, defineHandlerOutput, defineHandlerOutputs, getHandlerApi } from '../handler';

describe('Handler', () => {

    it('properly creates handler', async () => {
        // Arrange
        const id_1 = generateId();
        const id_2 = generateId();
        const traceId = generateTraceId();
        const inSchema = defineChannel('my-service', 'in',
            define('In_1', z.number()),
            define('In_2', z.string()),
        );
        const outSchema = defineChannel('my-service', 'out',
            define('Out_1', z.number()),
            define('Out_2', z.string()),
        );
        const outSchema_2 = defineChannel('my-service', 'out_2',
            define('Out_21', z.number()),
            define('Out_22', z.string()),
        )

        const handler = defineHandler({
            input: defineHandlerInput(inSchema, 'In_1'),
            output: defineHandlerOutputs(
                defineHandlerOutput(outSchema, ['Out_1', 'Out_2']),
                defineHandlerOutput(outSchema_2, ['Out_21']),
            ),
            handle: (api) => async ({ message, streamName }) => {
                api.out(streamName.id).Out_1(message.payload);
                api.out(streamName.id).Out_2(message.payload.toString());
                api.out_2(streamName.id).Out_21(message.payload + 5);
            },
        });

        const payload = 5;
        type In = MessageResult<MessageType<typeof inSchema.schema.In_1>>;
        type Out_1 = MessageResult<ChannelMessageType<typeof outSchema, ChannelTags<typeof outSchema>>>;
        type Out_2 = MessageResult<ChannelMessageType<typeof outSchema_2, ChannelTags<typeof outSchema_2>>>;
        const message: In = {
            traceId,
            streamName: getStreamName(inSchema)(id_1),
            message: { _tag: 'In_1', payload },
        };
        const recv_1: Out_1[] = [];
        const recv_2: Out_2[] = [];
        const api = getHandlerApi(
            traceId, handler.config.schema.output,
            msg => msg.streamName.channel === 'out' ? recv_1.push(msg as any) : recv_2.push(msg as any)
        );

        // Act
        await handler.execute(api)(message);

        // Assert
        expect(recv_1.length).toBe(2);
        expect(recv_2.length).toBe(1);

        const [m1, m2] = recv_1;
        const [m3] = recv_2;

        expect(m1.message._tag).toBe('Out_1')
        expect(m1.message.payload).toBe(payload);

        expect(m2.message._tag).toBe('Out_2')
        expect(m2.message.payload).toBe(payload.toString());

        expect(m3.message._tag).toBe('Out_21')
        expect(m3.message.payload).toBe(payload + 5);
    })

})