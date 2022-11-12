import { AggregateHandlerFunction, AggregateProjectionFunction, createAggregate, GetAggregateFunction, ProjectionSuccess, UpdateAggregateFunction } from '../';
import { generateTraceId } from '../../message';
import { generateId } from '../../stream';
import { nextTick } from '../../utils/tests';
import { z } from 'zod';

const stateSchema = z.object({
    total: z.number(),
});
const mathCommands = {
    name: 'math:command' as const,
    service: 'math' as const,
    schemas: {
        add: { _tag: 'Add' as const, schema: z.number() },
        subtract: { _tag: 'Subtract' as const, schema: z.number() },
    },
}
const mathEvents = {
    name: 'math' as const,
    service: 'math' as const,
    schemas: {
        added: { _tag: 'Added' as const, schema: z.number() },
        subtracted: { _tag: 'Subtracted' as const, schema: z.number() },
    },
}

describe('Aggregate', () => {
    it('properly handles projection updates', async () => {
        // Arrange
        const initialState: z.infer<typeof stateSchema> = { total: 0 };
        let state = { ...initialState };

        const config = {
            name: 'math' as const,
            schema: {
                state: stateSchema,
                commands: {
                    'math:command': mathCommands,
                },
                events: {
                    'math': mathEvents,
                },
            }
        }
        const handler: AggregateHandlerFunction<typeof config, string> = ({ send, success }) => async (command) => {
            switch (command._tag) {
                case 'Add':
                    send.math(command.aggregateId).added(command.payload);
                    return success();
                case 'Subtract':
                    send.math(command.aggregateId).subtracted(command.payload);
                    return success();
            }
        }
        const project: AggregateProjectionFunction<typeof config, string> = ({ success }) => (state, event) => {
            switch (event._tag) {
                case 'Added':
                    return success({ ...state, total: state.total + event.payload });
                case 'Subtracted':
                    return success({ ...state, total: state.total - event.payload });
            }
        }
        const get: GetAggregateFunction<typeof config, string> = ({ success }) => async () => success(state);
        const update: UpdateAggregateFunction<typeof config, string> = ({ success }) => async (id, s) => {
            state = s;
            return success(s);
        }
        const aggregate = createAggregate(config, handler, project, get, update);
        const id = generateId();
        const traceId = generateTraceId();

        // Act
        const commands = aggregate.component.messages.recv(traceId)['math:command'](id);
        commands.add(5);
        commands.subtract(7);
        commands.add(4);
        await nextTick();

        // Assert
        const actualState = await aggregate.get(id) as ProjectionSuccess<typeof config>;
        expect(state.total).toBe(2);
        expect(actualState.state.total).toBe(2);
    });
})