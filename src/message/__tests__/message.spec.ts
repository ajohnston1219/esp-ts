import { z } from 'zod';
import { getMessageCreator, Message, MessageCreatorNoId, MessagePayload, MessageSchema, MessageType } from '..';
import { define } from '../../schema';
import { AggregateId, generateId } from '../../stream';

describe('Message', () => {
    it('Successfully creates a schema', () => {
        // Arrange
        const messageSchema = define('Add', z.object({
            amount: z.number().min(0).max(100),
        }));
        const id = generateId();
        const traceId = generateId();
        const getStreamName = (id: AggregateId) => ({ service: 'my-service', channel: 'math', id });
        const addEvent = getMessageCreator<'Add', typeof messageSchema>('Add', getStreamName)(traceId)(id);
        const amount = 4;
        type S = typeof messageSchema;
        type M = MessageType<S>;
        type MC = MessageCreatorNoId<MessageType<S>>;

        // Act
        const event = addEvent({ amount });

        // Assert
        expect(event.traceId).toBe(traceId);
        expect(event.aggregateId).toBe(id);
        expect(event._tag).toBe('Add');
        expect(event.payload.amount).toBe(amount);
    });
});