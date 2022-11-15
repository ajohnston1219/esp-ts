import { createUserModel } from '../../utils/tests';

describe('Model', () => {

    it('properly creates a model', async () => {

        // Arrange
        const model = createUserModel();

        // Act
        await model.mutate.create({ name: 'Bobby', email: 'bobby@koth.com' });
        const fetched = await model.query.get();

        // Assert
        expect(fetched.name).toBe('Bobby');
        expect(fetched.email).toBe('bobby@koth.com');
    })

})