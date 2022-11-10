import { z } from 'zod';
import { getMessageCreators } from '..';

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
        const math = getMessageCreators(channelSchema);
        const addEvent = math.Add({ amount: 5 });
        const subtractEvent = math.Subtract({ amount: -2 });

        // Assert
        expect(addEvent._tag).toBe('Add');
        expect(addEvent.amount).toBe(5);
        expect(subtractEvent._tag).toBe('Subtract');
        expect(subtractEvent.amount).toBe(-2);
    })
})