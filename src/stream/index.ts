import * as uuid from 'uuid';

export type AggregateId = string;
export const generateId = uuid.v4;

export type Channel = {
    readonly service: string;
    readonly channel: string;
}
export type StreamName = {
    readonly id: AggregateId;
} & Channel;

export function streamEquals(a: StreamName, b: StreamName): boolean {
    return (
        channelEquals(a, b)
        && a.id === b.id
    );
}
export function channelEquals(a: Channel, b: Channel): boolean {
    return (
        a.service === b.service
        && a.channel === b.channel
    );
}