import { AnyQueryMap, AnyUpdateMap, createQuery, createUpdate, createView, ViewComponent, ViewConfig, ViewHandlerFunction, ViewSchema } from '..';
import { z } from 'zod';
import { generateId } from '../../stream';
import { generateTraceId } from '../../message';
import { nextTick } from '../../utils/tests';
import { ComponentHandlerFunction, InMessage } from '../../component';

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
            getUser: {
                _tag: 'Query' as const,
                name: 'getUser' as const,
                schema: {
                    input: z.void(),
                    output: userSchema,
                },
                execute: async () => user,
            },
        };
        const updates = {
            setUser: {
                _tag: 'Update' as const,
                name: 'setUser' as const,
                schema: {
                    input: userSchema,
                    output: z.void(),
                },
                execute: async (u) => {
                    user = u;
                },
            },
        };
        const schema  = {
            events: { user: userChannel },
            queries,
            updates,
        }
        const config = {
            name: 'user-view' as const,
            schema,
        }
        type _T = ViewComponent<typeof config>;
        type _F = ComponentHandlerFunction<_T, string>;
        type _M = InMessage<_T>;
        const view = createView(config, (q, u) => ({ success }) => async event => {
            switch (event._tag) {
                case 'UserCreated': {
                    await u.setUser(event.payload);
                    return success();
                }
                case 'UserEmailChanged': {
                    const current = await q.getUser();
                    await u.setUser({ ...current, email: event.payload });
                    return success();
                }
                case 'UserNameChanged': {
                    const current = await q.getUser();
                    await u.setUser({ ...current, name: event.payload });
                    return success();
                }
            }
        });

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