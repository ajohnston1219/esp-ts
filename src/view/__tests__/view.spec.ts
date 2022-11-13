import { createQuery, createUpdate, createView, ViewConfig, ViewHandlerFunction, ViewSchema } from '..';
import { z } from 'zod';
import { generateId } from '../../stream';
import { generateTraceId } from '../../message';
import { nextTick } from '../../utils/tests';

const emailSchema = z.string().email();
const nameSchema = z.string().min(3).max(5);
const userSchema = z.object({
    name: nameSchema,
    email: emailSchema,
})

describe('View', () => {

    it('successfully handles updates', async () => {
        // Arrange
        const messageSchemas = {
            created: { _tag: 'UserCreated' as const, schema: userSchema },
            nameChanged: { _tag: 'UserNameChanged' as const, schema: nameSchema },
            emailChanged: { _tag: 'UserEmailChanged' as const, schema: emailSchema },
        }
        const userChannel = {
            name: 'user' as const,
            service: '__LOCAL__',
            schemas: messageSchemas,
        }

        let user: z.infer<typeof userSchema> = {
            name: '',
            email: '',
        };

        const queries = {
            getUser: createQuery({
                name: 'getUser',
                schema: {
                    input: z.void(),
                    output: userSchema,
                },
                execute: async () => user,
            }),
        };
        const updates = {
            setUser: createUpdate({
                name: 'setUser',
                schema: {
                    input: userSchema,
                    output: z.void(),
                },
                execute: async (u) => { 
                    user = u;
                },
            }),
        }
        const schema: ViewSchema<typeof userChannel, typeof queries, any> = {
            events: { user: userChannel },
            queries,
            updates,
        }
        const config: ViewConfig<'user-view', typeof schema> = {
            name: 'user-view' as const,
            schema,
        }
        const handler: ViewHandlerFunction<typeof config, string> = (queries, updates) => ({ success }) => async (event) => {
            switch (event._tag) {
                case 'UserCreated': {
                    await updates.setUser(event.payload);
                    return success();
                }
                case 'UserEmailChanged': {
                    const current = await queries.getUser();
                    await updates.setUser({ ...current, email: event.payload });
                    return success();
                }
                case 'UserNameChanged': {
                    const current = await queries.getUser();
                    await updates.setUser({ ...current, name: event.payload });
                    return success();
                }
            }
        }
        const view = createView(config, handler);

        // Act
        const id = generateId();
        const traceId = generateTraceId();
        view.component.messages.recv(traceId).user(id).created({ name: 'Adam', email: 'ajohnston1219@gmail.com' });
        view.component.messages.recv(traceId).user(id).nameChanged('Bob');
        view.component.messages.recv(traceId).user(id).emailChanged('ajohnston@hippomed.us');
        await nextTick();

        // Assert
        expect(user.name).toBe('Bob');
        expect(user.email).toBe('ajohnston@hippomed.us');
    });

})