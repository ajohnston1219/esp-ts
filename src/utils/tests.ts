import { TypeOf, z } from 'zod';
import { AggregateHandlerFunction, AggregateProjectionFunction, AggregateState, createAggregate, GetAggregateFunction, UpdateAggregateFunction } from '../aggregate';
import { define } from '../schema';
import { AggregateId, defineChannel } from '../stream';
import { defineModel, defineMutation, defineMutations, defineQueries, defineQuery } from '../view/model';

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const nextTick = () => delay(0);

export function createPingPongComponentConfig() {
    const pingChannelSchema = defineChannel('my-service', 'ping',
        define('Ping', z.void()),
        define('PingMultiple', z.number().positive()),
    );
    const pongChannelSchema = defineChannel('my-service', 'pong',
        define('Pong', z.void()),
        define('PongMultiple', z.number().positive()),
    );
    const componentConfig = {
        name: 'my-component' as const,
        inputChannels: {
            'ping': pingChannelSchema,
        },
        outputChannels: {
            'pong': pongChannelSchema,
        },
    }

    return componentConfig;
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
    const config = {
        name: 'math' as const,
        initialState,
        schema: {
            state: stateSchema,
            commands: {
                'math:command': mathCommands,
            },
            events: {
                'math': mathEvents,
            },
        }
    }

    let state: { [key: AggregateId]: { state: AggregateState<typeof config>, version: number } } = {};

    const handler: AggregateHandlerFunction<typeof config, string> = ({ send, success }) => async ({ message: command, streamName: { id } }) => {
        switch (command._tag) {
            case 'Add':
                send.math(id).Added(command.payload);
                return success();
            case 'Subtract':
                send.math(id).Subtracted(command.payload);
                return success();
        }
    }
    const project: AggregateProjectionFunction<typeof config, string> = ({ success }) => (state, { message: event }) => {
        switch (event._tag) {
            case 'Added':
                return success({ ...state, total: state.total + event.payload });
            case 'Subtracted':
                return success({ ...state, total: state.total - event.payload });
        }
    }
    const get: GetAggregateFunction<typeof config, string> = ({ success, notFound }) => async (id) => {
        if (id in state) {
            return success(state[id].state, state[id].version);
        }
        return notFound();
    };
    const update: UpdateAggregateFunction<typeof config, string> = ({ success }) => async (id, s, v) => {
        if (id in state) {
            state[id] = { state: s, version: v };
        } else {
            state = Object.assign({ [id]: { state: s, version: v } }, state);
        }
        return success(s);
    }
    const aggregate = createAggregate(config, handler, project, get, update);
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