import { createView, ViewConfig, ViewSchema } from '..';
import { z } from 'zod';
import { generateId } from '../../stream';
import { defineMessage, generateTraceId } from '../../message';
import { createUserModel, nextTick } from '../../utils/tests';
import { defineChannel } from '../../schema/channel';
import { createHandler, createSubscription } from '../../schema/subscription';

const emailSchema = z.string().email();
const nameSchema = z.string().min(3).max(5);
const userSchema = z.object({
    name: nameSchema,
    email: emailSchema,
})

describe('View', () => {

    it('successfully handles updates', async () => {
        // Arrange
        const created = defineMessage('Created', userSchema);
        const nameChanged = defineMessage('NameChanged', nameSchema);
        const emailChanged = defineMessage('EmailChanged', emailSchema);
        const userChannel = defineChannel('my-service', 'user', created, nameChanged, emailChanged);

        const model = createUserModel();

        const schema: ViewSchema<typeof userChannel>  = {
            events: [ ['user', userChannel] ],
        };
        const config: ViewConfig<'user-view', typeof schema, typeof model> = {
            name: 'user-view' as const,
            schema,
            model,
        }
        const sub = createSubscription('user-view', userChannel, [], {
            Created: createHandler({
                input: userChannel,
                message: created,
                outputs: {
                    output: [],
                    failures: [],
                },
                execute: (api) => async ({ message }) => {
                    return api.success();
                },
            }),
            NameChanged: createHandler({
                input: userChannel,
                message: nameChanged,
                outputs: {
                    output: [],
                    failures: [],
                },
                execute: (api) => async ({ message }) => {
                    return api.success();
                },
            }),
            EmailChanged: createHandler({
                input: userChannel,
                message: emailChanged,
                outputs: {
                    output: [],
                    failures: [],
                },
                execute: (api) => async ({ message }) => {
                    return api.success();
                },
            }),
        })

        const view = createView(config, [[ 'user-view', sub ]]);

        // Act
        const id = generateId();
        const traceId = generateTraceId();
        // view.component.messages.recv(traceId).user(id).Created({ name: 'Adam', email: 'ajohnston1219@gmail.com' });
        // view.component.messages.recv(traceId).user(id).NameChanged('Bob');
        // view.component.messages.recv(traceId).user(id).EmailChanged('ajohnston@hippomed.us');
        await nextTick();

        // Assert
        // const user = await model.query.get();
        // expect(user.name).toBe('Bob');
        // expect(user.email).toBe('ajohnston@hippomed.us');
    });

})