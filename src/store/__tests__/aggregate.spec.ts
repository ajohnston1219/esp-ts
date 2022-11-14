import { InMemoryMessageStoreDB, MessageStore } from '..';
import { generateId } from '../../stream';
import { createMathAggregate, nextTick } from '../../utils/tests';
import { ProjectionSuccess, ProjectionSuccessWithVersion } from '../../aggregate';
import { generateTraceId } from '../../message';

describe('Message Store Bound Aggregate', () => {

    let messageStore: MessageStore;
    beforeEach(() => {
        const db = InMemoryMessageStoreDB.create();
        messageStore = MessageStore.create(db);
    });

    it('properly handles aggregate', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const aggregate = createMathAggregate();
        messageStore.bindAggregate(aggregate as any);
        const commands = aggregate.component.messages.recv(traceId)['math:command'](id);

        // Act
        commands.Add(5);
        commands.Subtract(7);
        commands.Add(4);
        await nextTick();

        // Assert
        const actualState = await aggregate.get(id) as ProjectionSuccess<typeof aggregate.config>;
        expect(actualState.state.total).toBe(2);

    });

    it('properly fetches aggregate', async () => {
        // Arrange
        const id = generateId();
        const traceId = generateTraceId();
        const aggregate = createMathAggregate();
        messageStore.bindAggregate(aggregate);
        const commands = aggregate.component.messages.recv(traceId)['math:command'](id);

        // Act
        commands.Add(5);
        commands.Subtract(7);
        commands.Add(4);
        await nextTick();

        // Assert
        const actualState = await messageStore.getAggregate(aggregate)(id) as ProjectionSuccessWithVersion<typeof aggregate.config>;
        expect(actualState.state.total).toBe(2);
        expect(actualState.version).toBe(3);
    });

});