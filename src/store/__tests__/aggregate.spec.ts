import { InMemoryMessageStoreDB, MessageStore } from '..';
import { generateId } from '../../stream';
import { createMathAggregate } from '../../utils/tests';
import { Aggregate, AggregateComponent } from '../../aggregate';

describe('Message Store Bound Aggregate', () => {

    let messageStore: MessageStore;
    beforeEach(() => {
        const db = InMemoryMessageStoreDB.create();
        messageStore = MessageStore.create(db);
    });

    it('properly handles aggregate', async () => {
        // Arrange
        const id = generateId();
        const aggregate = createMathAggregate();
        type _C = AggregateComponent<typeof aggregate.config>;
        type _A = typeof aggregate.component;
        type _Is = _A extends _C ? true : false;
        type _T = typeof aggregate;
        messageStore.bindAggregate(aggregate);
        const commands = aggregate.component.messages.recv(traceId)['math:command'](id);
        commands.add(5);
        commands.subtract(7);
        commands.add(4);
        await nextTick();

        // Assert
        const actualState = await aggregate.get(id) as ProjectionSuccess<typeof aggregate.config>;
        expect(actualState.state.total).toBe(2);

        // Act

        // Assert
    });

});