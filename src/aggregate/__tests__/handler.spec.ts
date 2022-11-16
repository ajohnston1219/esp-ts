import { z } from 'zod';
import { AnyMessage, generateTraceId, MessageType, TraceId } from '../../message';
import { define } from '../../schema';
import { defineChannel, generateId } from '../../stream';
import { defineHandler, defineHandlerInput, defineHandlerOutput, defineHandlerOutputs, getHandlerApi, HandlerAPI } from '../handler';

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
            handle: (api) => async (msg) => {
                api.out(id_1).Out_1(msg.payload);
                api.out(id_1).Out_2(msg.payload.toString());
                api.out_2(id_2).Out_21(msg.payload + 5);
            },
        });

        const payload = 5;
        const message: MessageType<typeof inSchema.schema.In_1> = { _tag: 'In_1', payload };
        const recv: AnyMessage[] = [];
        const api = getHandlerApi(traceId, handler.config.schema.output, msg => recv.push(msg));

        // Act
        await handler.execute(api)(message);

        // Assert
        expect(recv.length).toBe(3);

        const [m1, m2, m3] = recv;

        expect(m1._tag).toBe('Out_1')
        expect(m1.payload).toBe(payload);

        expect(m2._tag).toBe('Out_2')
        expect(m2.payload).toBe(payload.toString());

        expect(m3._tag).toBe('Out_21')
        expect(m3.payload).toBe(payload + 5);
    })

})