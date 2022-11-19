import { z } from 'zod';
import { defineMessage, getMessageCreator } from '..';
import { define } from '../../schema';
import { AggregateId, generateId } from '../../stream';

describe('Message', () => {
    it('Successfully creates a schema', () => {
        // Arrange
        const messageSchema = defineMessage('Add', z.object({
            amount: z.number().min(0).max(100),
        }));
        const id = generateId();
        const traceId = generateId();
        const getStreamName = (id: AggregateId) => ({ service: 'my-service', channel: 'math', id });
        const addEvent = getMessageCreator('Add', getStreamName)(traceId)(id);
        const amount = 4;

        // Act
        const event = addEvent({ amount });

        // Assert
        expect(event.traceId).toBe(traceId);
        expect(event.streamName.id).toBe(id);
        expect(event.message._tag).toBe('Add');
        expect(event.message.payload.amount).toBe(amount);
    });
});