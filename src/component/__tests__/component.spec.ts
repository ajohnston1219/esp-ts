import { z } from 'zod';
import { ComponentChannelMessageCreators, ComponentChannelNames, ComponentChannelSchema, ComponentChannelSchemas, ComponentMessageCreators, ComponentTags, createComponent } from '..';
import { MessageCreator } from '../../message';
import { ChannelMessageCreators, ChannelSchemas, ChannelTags } from '../../stream';

describe('Component', () => {
    it('Properly creates component definition', () => {
        // Arrange
        const mathSchema = {
            name: 'math' as const,
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
        const pingPongSchema = {
            name: 'ping-pong' as const,
            schemas: {
                Ping: { _tag: 'Ping' as const, schema: z.undefined() },
                Pong: { _tag: 'Pong' as const, schema: z.undefined() },
            },
        }
        const componentConfig = {
            name: 'my-component' as const,
            channels: {
                'math': mathSchema,
                'ping-pong': pingPongSchema,
            }
        }
        const component = createComponent(componentConfig);

        // Act
        const add = component.messages.math.Add({ amount: 10 });
        const subtract = component.messages.math.Subtract({ amount: -10 });
        const ping = component.messages['ping-pong'].Pong();

        // Assert
    })
})