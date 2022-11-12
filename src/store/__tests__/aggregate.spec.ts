import { InMemoryMessageStoreDB, MessageStore } from '..';
import { generateId } from '../../stream';
import { createMathAggregate, nextTick } from '../../utils/tests';
import { AggregateComponent, ProjectionSuccess } from '../../aggregate';
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
        commands.add(5);
        commands.subtract(7);
        commands.add(4);
        await nextTick();

        // Act

        // Assert
        const actualState = await aggregate.get(id) as ProjectionSuccess<typeof aggregate.config>;
        expect(actualState.state.total).toBe(2);

    });

});