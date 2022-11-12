import { z } from 'zod';
import { getMessageCreator, Message, MessagePayload, MessageSchema } from '..';
import { AggregateId, generateId } from '../../stream';

describe('Message', () => {
    it('Successfully creates a schema', () => {
        // Arrange
        const messageSchema = {
            _tag: 'Add' as const,
            schema: z.object({
                amount: z.number().min(0).max(100),
            })
        }
        const id = generateId();
        const traceId = generateId();
        const getStreamName = (id: AggregateId) => ({ service: 'my-service', channel: 'math', id });
        const addEvent = getMessageCreator<typeof messageSchema>('Add', getStreamName)(traceId)(id);
        const amount = 4;

        // Act
        const event = addEvent({ amount });

        // Assert
        expect(event.traceId).toBe(traceId);
        expect(event.aggregateId).toBe(id);
        expect(event._tag).toBe('Add');
        expect(event.payload.amount).toBe(amount);
    });
});