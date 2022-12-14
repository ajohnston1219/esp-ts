import { z } from 'zod';
import { generateId, getMessageCreators } from '..';
import { defineMessage, generateTraceId } from '../../message';
import { defineChannel } from '../../schema/channel';

describe('Channel', () => {
    it('Properly creates channel definition', () => {
        // Arrange
        const channelSchema = defineChannel('my-service', 'math',
            defineMessage('Add', z.object({ amount: z.number() })),
            defineMessage('Subtract', z.object({ amount: z.number() })),
        );

        // Act
        const traceId = generateTraceId();
        const addId = generateId();
        const subtractId = generateId();
        const math = getMessageCreators(channelSchema);
        const addEvent = math.Add(traceId)(addId)({ amount: 5 });
        const subtractEvent = math.Subtract(traceId)(subtractId)({ amount: -2 });

        // Assert
        expect(addEvent.traceId).toBe(traceId);
        expect(addEvent.streamName).toStrictEqual({ channel: 'math', service: 'my-service', id: addId });
        expect(addEvent.message._tag).toBe('Add');
        expect(addEvent.message.payload.amount).toBe(5);
        expect(subtractEvent.traceId).toBe(traceId);
        expect(subtractEvent.streamName).toStrictEqual({ channel: 'math', service: 'my-service', id: subtractId });
        expect(subtractEvent.message._tag).toBe('Subtract');
        expect(subtractEvent.message.payload.amount).toBe(-2);
    })
})