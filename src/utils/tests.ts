import { z } from 'zod';
import { Aggregate, AggregateHandlerFunction, AggregateProjectionFunction, AnyAggregate, AnyAggregateConfig, createAggregate, GetAggregateFunction, UpdateAggregateFunction } from '../aggregate';
import { ChannelSchema } from '../stream';

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const nextTick = () => delay(0);

export function createPingPongComponentConfig() {
    const pingSchema = {
        service: 'my-service' as const,
        name: 'ping' as const,
        schemas: {
            ping: { _tag: 'Ping' as const, schema: z.undefined() },
        },
    }
    const pongSchema = {
        service: 'my-service' as const,
        name: 'pong' as const,
        schemas: {
            pong: { _tag: 'Pong' as const, schema: z.undefined() },
        },
    }
    const componentConfig = {
        name: 'my-component' as const,
        inputChannels: {
            'ping': pingSchema,
        },
        outputChannels: {
            'pong': pongSchema,
        },
    }

    return componentConfig;
}
export function createMathAggregate() {
    const stateSchema = z.object({
        total: z.number(),
    });
    const mathCommands = {
        name: 'math:command' as const,
        service: 'math' as const,
        schemas: {
            add: { _tag: 'Add' as const, schema: z.number() },
            subtract: { _tag: 'Subtract' as const, schema: z.number() },
        },
    }
    const mathEvents = {
        name: 'math' as const,
        service: 'math' as const,
        schemas: {
            added: { _tag: 'Added' as const, schema: z.number() },
            subtracted: { _tag: 'Subtracted' as const, schema: z.number() },
        },
    }

    const initialState: z.infer<typeof stateSchema> = { total: 0 };
    let state = { ...initialState };
    let version = 0;

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
    const handler: AggregateHandlerFunction<typeof config, string> = ({ send, success }) => async (command) => {
        switch (command._tag) {
            case 'Add':
                send.math(command.aggregateId).added(command.payload);
                return success();
            case 'Subtract':
                send.math(command.aggregateId).subtracted(command.payload);
                return success();
        }
    }
    const project: AggregateProjectionFunction<typeof config, string> = ({ success }) => (state, event) => {
        switch (event._tag) {
            case 'Added':
                return success({ ...state, total: state.total + event.payload });
            case 'Subtracted':
                return success({ ...state, total: state.total - event.payload });
        }
    }
    const get: GetAggregateFunction<typeof config, string> = ({ success }) => async () => success(state, version);
    const update: UpdateAggregateFunction<typeof config, string> = ({ success }) => async (id, s) => {
        state = s;
        version = version + 1;
        return success(s, version);
    }
    const aggregate = createAggregate(config, handler, project, get, update);
    return aggregate;
}