import { createView } from '..';
import { z } from 'zod';
import { defineChannel, generateId } from '../../stream';
import { generateTraceId } from '../../message';
import { createUserModel, nextTick } from '../../utils/tests';
import { define } from '../../schema';

const emailSchema = z.string().email();
const nameSchema = z.string().min(3).max(5);
const userSchema = z.object({
    name: nameSchema,
    email: emailSchema,
})

describe('View', () => {

    it('successfully handles updates', async () => {
        // Arrange
        const userChannel = defineChannel('my-service', 'user',
            define('Created', userSchema),
            define('NameChanged', nameSchema),
            define('EmailChanged', emailSchema),
        )

        const model = createUserModel();

        const schema  = {
            events: { user: userChannel },
        };
        const config = {
            name: 'user-view' as const,
            schema,
            model,
        }

        const view = createView(config, (model) => ({ success }) => async event => {
            switch (event._tag) {
                case 'Created': {
                    await model.mutate.create(event.payload);
                    return success();
                }
                case 'EmailChanged': {
                    await model.mutate.changeEmail(event.payload)
                    return success();
                }
                case 'NameChanged': {
                    await model.mutate.changeName(event.payload)
                    return success();
                }
            }
        });

        // Act
        const id = generateId();
        const traceId = generateTraceId();
        view.component.messages.recv(traceId).user(id).Created({ name: 'Adam', email: 'ajohnston1219@gmail.com' });
        view.component.messages.recv(traceId).user(id).NameChanged('Bob');
        view.component.messages.recv(traceId).user(id).EmailChanged('ajohnston@hippomed.us');
        await nextTick();

        // Assert
        const user = await model.query.get();
        expect(user.name).toBe('Bob');
        expect(user.email).toBe('ajohnston@hippomed.us');
    });

})