import { createView, defineQueries, defineQuery, defineUpdate, defineUpdates } from '..';
import { z } from 'zod';
import { defineChannel, generateId } from '../../stream';
import { generateTraceId } from '../../message';
import { nextTick } from '../../utils/tests';
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

        let user: z.infer<typeof userSchema> = {
            name: '',
            email: '',
        };

        const queries = defineQueries(
            defineQuery({
                name: 'getUser',
                input: z.number(),
                output: userSchema,
                execute: async () => user,
            }),
        );
        const updates = defineUpdates(
            defineUpdate({
                name: 'setUser',
                input: z.void(),
                output: z.void(),
                execute: async () => {},
            }),
        )
        type T = typeof updates.setUser.input;
        const schema  = {
            events: { user: userChannel },
            queries,
            updates,
        };
        const config = {
            name: 'user-view' as const,
            schema,
        }
        const view = createView(config, (q, u) => ({ success }) => async event => {
            switch (event._tag) {
                case 'Created': {
                    await u.setUser(event.payload);
                    return success();
                }
                case 'EmailChanged': {
                    const current = await q.getUser();
                    await u.setUser({ ...current, email: event.payload });
                    return success();
                }
                case 'NameChanged': {
                    const current = await q.getUser();
                    await u.setUser({ ...current, name: event.payload });
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
        expect(user.name).toBe('Bob');
        expect(user.email).toBe('ajohnston@hippomed.us');
    });

})