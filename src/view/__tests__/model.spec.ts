import { TypeOf, z } from 'zod';
import * as Model from '../model';

const userSchema = z.object({
    name: z.string(),
    email: z.string().email(),
})

describe('Model', () => {

    it('properly creates a model', async () => {

        // Arrange
        let user: TypeOf<typeof userSchema> = {
            name: 'Adam',
            email: 'ajohnston@hippomed.us',
        }

        const getFn = Model.defineFunction('get', z.tuple([z.void()]), z.promise(userSchema));
        const get = Model.defineQuery('get', {
            schema: getFn,
            execute: async () => user,
        })
        const query = Model.defineQueries(get);

        const create = Model.defineMutation('create', {
            schema: Model.defineFunction('create', z.tuple([userSchema]), z.promise(z.void())),
            execute: async u => { user = u; },
        })
        const mutate = Model.defineMutations(create);

        const model = Model.defineModel('user', { query, mutate });

        // Act
        await model.mutate.create({ name: 'Bobby', email: 'bobby@koth.com' });
        const fetched = await model.query.get();

        // Assert
        expect(fetched.name).toBe('Bobby');
        expect(fetched.email).toBe('bobby@koth.com');
    })

})