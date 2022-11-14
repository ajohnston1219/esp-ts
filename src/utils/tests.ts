import { z } from 'zod';
import { AggregateHandlerFunction, AggregateProjectionFunction, AggregateState, createAggregate, GetAggregateFunction, UpdateAggregateFunction } from '../aggregate';
import { Message, MessageCreator, MessagePayload, MessageTag, MessageType } from '../message';
import { define, defineMap } from '../schema';
import { AggregateId, ChannelMessageCreatorsNoId, ChannelName, ChannelTags, defineChannel } from '../stream';
import { KeysOfUnion } from './types';

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

// export function createMathAggregate() {
//     const stateSchema = z.object({
//         total: z.number(),
//     });
//     const mathCommands = {
//         name: 'math:command' as const,
//         service: 'math' as const,
//         schemas: {
//             add: { _tag: 'Add' as const, schema: z.number() },
//             subtract: { _tag: 'Subtract' as const, schema: z.number() },
//         },
//     }
//     const mathEvents = {
//         name: 'math' as const,
//         service: 'math' as const,
//         schemas: {
//             added: { _tag: 'Added' as const, schema: z.number() },
//             subtracted: { _tag: 'Subtracted' as const, schema: z.number() },
//         },
//     }

//     const initialState: z.infer<typeof stateSchema> = { total: 0 };
//     const config = {
//         name: 'math' as const,
//         initialState,
//         schema: {
//             state: stateSchema,
//             commands: {
//                 'math:command': mathCommands,
//             },
//             events: {
//                 'math': mathEvents,
//             },
//         }
//     }

//     let state: { [key: AggregateId]: { state: AggregateState<typeof config>, version: number } } = {};

//     const handler: AggregateHandlerFunction<typeof config, string> = ({ send, success }) => async (command) => {
//         switch (command._tag) {
//             case 'Add':
//                 send.math(command.aggregateId).added(command.payload);
//                 return success();
//             case 'Subtract':
//                 send.math(command.aggregateId).subtracted(command.payload);
//                 return success();
//         }
//     }
//     const project: AggregateProjectionFunction<typeof config, string> = ({ success }) => (state, event) => {
//         switch (event._tag) {
//             case 'Added':
//                 return success({ ...state, total: state.total + event.payload });
//             case 'Subtracted':
//                 return success({ ...state, total: state.total - event.payload });
//         }
//     }
//     const get: GetAggregateFunction<typeof config, string> = ({ success, notFound }) => async (id) => {
//         if (id in state) {
//             return success(state[id].state, state[id].version);
//         }
//         return notFound();
//     };
//     const update: UpdateAggregateFunction<typeof config, string> = ({ success }) => async (id, s, v) => {
//         if (id in state) {
//             state[id] = { state: s, version: v };
//         } else {
//             state = Object.assign({ [id]: { state: s, version: v } }, state);
//         }
//         return success(s);
//     }
//     const aggregate = createAggregate(config, handler, project, get, update);
//     return aggregate;
// }