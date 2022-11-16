import { map, of } from 'rxjs';
import { ProjectionSuccess } from '../';
import { AnyMessage, generateTraceId } from '../../message';
import { generateId, getStreamName } from '../../stream';
import { createMathAggregate, nextTick } from '../../utils/tests';

describe('Aggregate', () => {
    it('properly handles projection updates', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const aggregate = createMathAggregate();

        // Act
        const commands = aggregate.component.messages.recv(traceId)['math:command'](id);
        const add = commands.Add(5);
        commands.Subtract(7);
        commands.Add(4);
        await nextTick();

        // Assert
        const actualState = await aggregate.get(id) as ProjectionSuccess<typeof aggregate.config>;
        expect(actualState.state.total).toBe(2);
    });

    it('properly handles projection hydration', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const aggregate = createMathAggregate();

        // Act
        const events = aggregate.component.messages.create.send(traceId).math(id);
        const event$ = of(events.Added(2), events.Subtracted(4), events.Added(1));
        await aggregate.hydrate(id, event$);

        // Assert
        const actualState = await aggregate.get(id) as ProjectionSuccess<typeof aggregate.config>;
        expect(actualState.state.total).toBe(-1);
    });

    it('properly handles projection hydration of empty stream', async () => {
        // Arrange
        const id = generateId();
        const aggregate = createMathAggregate();

        // Act
        const event$ = of();
        await aggregate.hydrate(id, event$);

        // Assert
        const actualState = await aggregate.get(id);
        expect(actualState._tag).toBe('NotFound');
    });
})