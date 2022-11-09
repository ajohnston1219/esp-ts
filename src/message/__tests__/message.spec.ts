import { z } from 'zod';
import { getMessageCreator, Message, MessagePayload, MessageSchema } from '..';

describe('Message', () => {
    it('Successfully creates a schema', () => {
        // Arrange
        const messageSchema = {
            _tag: 'Add' as const,
            schema: z.object({
                amount: z.number().min(0).max(100),
            })
        }
        const addEvent = getMessageCreator<typeof messageSchema>('Add');
        const amount = 4;

        // Act
        const event = addEvent({ amount });

        // Assert
        expect(event._tag).toBe('Add');
        expect(event.amount).toBe(amount);
    });
});