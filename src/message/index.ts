import { StreamName } from '../stream';
import * as uuid from 'uuid';

export interface Message<Tag extends string> {
    readonly _tag: Tag;
}

export type TraceId = string;
export const generateTraceId = uuid.v4;
interface Envelope<M extends Message<string>> {
    readonly traceId: TraceId;
    readonly streamName: StreamName;
    readonly message: M;
}
export type AnyMessage = Message<string>;
export interface OutgoingMessage<M extends AnyMessage> extends Envelope<M> {
}
export interface IncomingMessage<M extends AnyMessage> extends Envelope<M> {
    readonly id: string;
    readonly version: number;
}
export interface StoredMessage<M extends AnyMessage> extends IncomingMessage<M> {
    readonly depth: number;
    readonly channelVersion: number;
}
