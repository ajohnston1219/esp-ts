import { TypeOf, z } from 'zod'
// import { createAggregate } from '../aggregate';
import { Component, ComponentConfig, createComponent } from '../component';
import { defineMessage } from '../message';
import { define } from '../schema';
import { defineChannel } from '../schema/channel';
import { AnySubscription } from '../schema/subscription';
import { defineModel, defineMutation, defineMutations, defineQueries, defineQuery } from '../view/model';

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const nextTick = () => delay(0);

export function getPingPongComponentCreator() {
    const pingMessage = defineMessage('Ping', z.void());
    const pingMultiMessage = defineMessage('PingMultiple', z.number().positive());
    const pingChannel = defineChannel('my-service', 'ping', pingMessage, pingMultiMessage);

    const pongMessage = defineMessage('Pong', z.void());
    const pongMultiMessage = defineMessage('PongMultiple', z.number().positive());
    const pongChannel = defineChannel('my-service', 'pong', pongMessage, pongMultiMessage);

    type In = typeof pingChannel;
    type Out = typeof pongChannel;
    const componentConfig = {
        name: 'my-component' as const,
        inputChannels: {
            'ping': define('ping', pingChannel),
        },
        outputChannels: {
            'pong': define('pong', pongChannel),
        },
    }
    const create = (subscriptions: [...AnySubscription<In, Out>[]]) => {
        const config: ComponentConfig<'my-component', In, Out> = { ...componentConfig, subscriptions: subscriptions.map(s => [s.name, s]) };
        return createComponent<typeof config, In, Out>(config);
    }
    return { create, pingChannel, pingMessage, pingMultiMessage, pongChannel, pongMessage, pongMultiMessage };
}

// export function createMathAggregate() {
//     const stateSchema = z.object({
//         total: z.number(),
//     });
//     const mathCommands = defineChannel('my-service', 'math:command',
//         defineMessage('Add', z.number()),
//         defineMessage('Subtract', z.number()),
//     );
//     const mathEvents = defineChannel('my-service', 'math',
//         defineMessage('Added', z.number()),
//         defineMessage('Subtracted', z.number()),
//     );

//     const initialState: z.infer<typeof stateSchema> = { total: 0 };
//     let state: { [key: AggregateId]: { state: z.infer<typeof stateSchema>, version: number } } = {};

//     const tags = {
//         math: {
//             Added: true,
//             Subtracted: false,
//         }
//     }
//     const addHandler = defineHandler<typeof mathCommands, 'Add', typeof mathEvents, typeof tags>({
//         tag: 'Add',
//         input: defineHandlerInput(mathCommands, 'Add'),
//         output: defineHandlerOutputs(
//             defineHandlerOutput('math', mathEvents, 'Added'),
//         ),
//         handle: (api) => async (incoming) => {
//             api.math(incoming.streamName.id).Added(incoming.message.payload);
//         },
//     });
//     const subtractHandler = defineHandler<typeof mathCommands, 'Subtract', typeof mathEvents, typeof tags>({
//         tag: 'Subtract',
//         input: defineHandlerInput(mathCommands, 'Subtract'),
//         output: defineHandlerOutputs(
//             defineHandlerOutput('math', mathEvents, 'Subtracted'),
//         ),
//         handle: (api) => async (incoming) => {
//             api.math(incoming.streamName.id).Subtracted(incoming.message.payload);
//         },
//     });

//     // const config: AggregateCreateConfig<'math', typeof stateSchema, typeof mathCommands, typeof mathEvents, typeof tags, string> = {
//     // }

//     const schema = {
//         state: stateSchema,
//         commands: {
//             'math:command': mathCommands,
//         },
//         events: {
//             'math': mathEvents,
//         },
//     };
//     const aggregate = createAggregate('math', schema, {
//         name: 'math',
//         initialState,
//         project: ({ success }) => (state, { message: event }) => {
//             switch (event._tag) {
//                 case 'Added':
//                     return success({ ...state, total: state.total + event.payload });
//                 case 'Subtracted':
//                     return success({ ...state, total: state.total - event.payload });
//             }
//         },
//         get: ({ success, notFound }) => async (id) => {
//             if (id in state) {
//                 return success(state[id].state, state[id].version);
//             }
//             return notFound();
//         },
//         update: ({ success }) => async (id, s, v) => {
//             if (id in state) {
//                 state[id] = { state: s, version: v };
//             } else {
//                 state = Object.assign({ [id]: { state: s, version: v } }, state);
//             }
//             return success(s);
//         },
//         handlers: {
//             'math:command': {
//                 'Add': addHandler,
//                 'Subtract': subtractHandler,
//             },
//         }
//     });

//     return aggregate;
// }

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