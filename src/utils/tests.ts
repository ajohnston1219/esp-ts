import { TypeOf, z } from 'zod'
import { AggregateCreateConfig, createAggregate } from '../aggregate';
import { ComponentConfig, ComponentHandlerFunction, createComponent } from '../component';
import { defineHandler, defineHandlerInput, defineHandlerOutput, defineHandlerOutputs } from '../component/handler';
import { define } from '../schema';
import { AggregateId, defineChannel } from '../stream';
import { defineModel, defineMutation, defineMutations, defineQueries, defineQuery } from '../view/model';

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const nextTick = () => delay(0);

export function getPingPongComponentCreator() {
    const pingChannelSchema = defineChannel('my-service', 'ping',
        define('Ping', z.void()),
        define('PingMultiple', z.number().positive()),
    );
    const pongChannelSchema = defineChannel('my-service', 'pong',
        define('Pong', z.void()),
        define('PongMultiple', z.number().positive()),
    );
    const componentConfig: ComponentConfig<'my-component', typeof pingChannelSchema, typeof pongChannelSchema> = {
        name: 'my-component' as const,
        inputChannels: {
            'ping': pingChannelSchema,
        },
        outputChannels: {
            'pong': pongChannelSchema,
        },
    }
    return (handler: ComponentHandlerFunction<typeof componentConfig, typeof pingChannelSchema, typeof pongChannelSchema, string, true>) =>
        createComponent(componentConfig, handler);
}

export function createMathAggregate() {
    const stateSchema = z.object({
        total: z.number(),
    });
    const mathCommands = defineChannel('my-service', 'math:command',
        define('Add', z.number()),
        define('Subtract', z.number()),
    );
    const mathEvents = defineChannel('my-service', 'math',
        define('Added', z.number()),
        define('Subtracted', z.number()),
    );

    const initialState: z.infer<typeof stateSchema> = { total: 0 };
    let state: { [key: AggregateId]: { state: z.infer<typeof stateSchema>, version: number } } = {};

    const tags = {
        math: {
            Added: true,
            Subtracted: false,
        }
    }
    const addHandler = defineHandler<typeof mathCommands, 'Add', typeof mathEvents, typeof tags>({
        tag: 'Add',
        input: defineHandlerInput(mathCommands, 'Add'),
        output: defineHandlerOutputs(
            defineHandlerOutput('math', mathEvents, 'Added'),
        ),
        handle: (api) => async (incoming) => {
            api.math(incoming.streamName.id).Added(incoming.message.payload);
        },
    });
    const subtractHandler = defineHandler<typeof mathCommands, 'Subtract', typeof mathEvents, typeof tags>({
        tag: 'Subtract',
        input: defineHandlerInput(mathCommands, 'Subtract'),
        output: defineHandlerOutputs(
            defineHandlerOutput('math', mathEvents, 'Subtracted'),
        ),
        handle: (api) => async (incoming) => {
            api.math(incoming.streamName.id).Subtracted(incoming.message.payload);
        },
    });

    const config: AggregateCreateConfig<'math', typeof stateSchema, typeof mathCommands, typeof mathEvents, typeof tags, string> = {
        name: 'math',
        initialState,
        schema: {
            state: stateSchema,
            commands: {
                'math:command': mathCommands,
            },
            events: {
                'math': mathEvents,
            },
        },
        project: ({ success }) => (state, { message: event }) => {
            switch (event._tag) {
                case 'Added':
                    return success({ ...state, total: state.total + event.payload });
                case 'Subtracted':
                    return success({ ...state, total: state.total - event.payload });
            }
        },
        get: ({ success, notFound }) => async (id) => {
            if (id in state) {
                return success(state[id].state, state[id].version);
            }
            return notFound();
        },
        update: ({ success }) => async (id, s, v) => {
            if (id in state) {
                state[id] = { state: s, version: v };
            } else {
                state = Object.assign({ [id]: { state: s, version: v } }, state);
            }
            return success(s);
        },
        handlers: {
            'math:command': {
                'Add': addHandler,
                'Subtract': subtractHandler,
            },
        }
    }

    const aggregate = createAggregate(config);

    return aggregate;
}

export function createUserModel() {
    const userSchema = z.object({
        name: z.string(),
        email: z.string().email(),
    })

    let user: TypeOf<typeof userSchema> = {
        name: 'Adam',
        email: 'ajohnston@hippomed.us',
    }

    const get = defineQuery('get', {
        inputs: z.tuple([z.void()]),
        output: z.promise(userSchema),
        execute: async () => user,
    })
    const query = defineQueries(get);

    const create = defineMutation('create', {
        inputs: z.tuple([userSchema]),
        output: z.promise(z.void()),
        execute: async u => { user = u; },
    })
    const changeName = defineMutation('changeName', {
        inputs: z.tuple([z.string()]),
        output: z.promise(z.void()),
        execute: async name => { user = { ...user, name } },
    })
    const changeEmail = defineMutation('changeEmail', {
        inputs: z.tuple([z.string().email()]),
        output: z.promise(z.void()),
        execute: async email => { user = { ...user, email } },
    })
    const mutate = defineMutations(create, changeName, changeEmail);

    const model = defineModel('user', { query, mutate });

    return model;
}