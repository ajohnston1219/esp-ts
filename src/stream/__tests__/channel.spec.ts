import { z } from 'zod';
import { generateId, getMessageCreators } from '..';
import { generateTraceId } from '../../message';

describe('Channel', () => {
    it('Properly creates channel definition', () => {
        // Arrange
        const channelSchema = {
            service: 'my-service',
            name: 'math',
            schemas: {
                Add: {
                    _tag: 'Add' as const,
                    schema: z.object({
                        amount: z.number().min(0).max(100),
                    })
                },
                Subtract: {
                    _tag: 'Subtract' as const,
                    schema: z.object({
                        amount: z.number().min(-100).max(0),
                    }),
                }
            }
        }

        // Act
        const traceId = generateTraceId();
        const addId = generateId();
        const subtractId = generateId();
        const math = getMessageCreators(channelSchema);
        const addEvent = math.Add(traceId)(addId)({ amount: 5 });
        const subtractEvent = math.Subtract(traceId)(subtractId)({ amount: -2 });

        // Assert
        expect(addEvent.traceId).toBe(traceId);
        expect(addEvent.aggregateId).toBe(addId);
        expect(addEvent.streamName).toStrictEqual({ channel: 'math', service: 'my-service', id: addId });
        expect(addEvent._tag).toBe('Add'); 
        expect(addEvent.payload.amount).toBe(5);
        expect(subtractEvent.traceId).toBe(traceId);
        expect(subtractEvent.aggregateId).toBe(subtractId);
        expect(subtractEvent.streamName).toStrictEqual({ channel: 'math', service: 'my-service', id: subtractId });
        expect(subtractEvent._tag).toBe('Subtract');
        expect(subtractEvent.payload.amount).toBe(-2);
    })
})