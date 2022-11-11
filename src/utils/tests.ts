import { z } from 'zod';

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const nextTick = () => delay(0);

export function createPingPongComponentConfig() {
    const pingSchema = {
        service: 'my-service',
        name: 'ping' as const,
        schemas: {
            ping: { _tag: 'Ping' as const, schema: z.undefined() },
        },
    }
    const pongSchema = {
        service: 'my-service',
        name: 'pong' as const,
        schemas: {
            pong: { _tag: 'Pong' as const, schema: z.undefined() },
        },
    }
    const componentConfig = {
        name: 'my-component' as const,
        failureReasons: [ 'Unknown' as const ],
        inputChannels: {
            'ping': pingSchema,
        },
        outputChannels: {
            'pong': pongSchema,
        },
    }

    return componentConfig;
}