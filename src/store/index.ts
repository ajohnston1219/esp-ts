import { AnyMessage, IncomingMessage, OutgoingMessage, StoredMessage } from '../message';
import { AggregateId, Channel, channelEquals, generateId, streamEquals } from '../stream';
import { concat, concatMap, distinct, filter, from, fromEvent, map, Observable, of, shareReplay, Subscription, tap } from 'rxjs';
import { EventEmitter } from 'events';
import { Dispatcher } from './dispatcher';

interface LogResult {
    readonly id: AggregateId;
    readonly version: number;
    readonly depth: number;
}

interface MessageStoreDB {
    logMessage(message: OutgoingMessage<AnyMessage>): Promise<LogResult>;
    getDispatcherStream<M extends AnyMessage>(dispatcher: Dispatcher<M>): Observable<StoredMessage<M>>;
}

export class InMemoryMessageStoreDB implements MessageStoreDB {
    private _log: StoredMessage<AnyMessage>[];
    private constructor() {
        this._log = [];
    }
    public static create(): InMemoryMessageStoreDB {
        return new InMemoryMessageStoreDB();
    }

    public async logMessage(_message: OutgoingMessage<AnyMessage>): Promise<LogResult> {
        const id = generateId();
        const version = this.getAggregateVersion(_message) + 1;
        const channelVersion = this.getChannelVersion(_message) + 1;
        const depth = this.getDepth(_message);
        const message: StoredMessage<AnyMessage> = { id, version, channelVersion, depth, ..._message };
        this._log.push(message);
        return { id, version, depth };
    }

    public getDispatcherStream<M extends AnyMessage>(dispatcher: Dispatcher<M>): Observable<StoredMessage<M>> {
        return from(this._log.filter(msg => dispatcher.filter(msg))) as Observable<StoredMessage<M>>;
    }

    private getAggregateVersion({ streamName }: OutgoingMessage<AnyMessage>): number {
        return this._log.filter(m => streamEquals(m.streamName, streamName)).length;
    }
    private getChannelVersion({ streamName }: OutgoingMessage<AnyMessage>): number {
        return this._log.filter(m => channelEquals(m.streamName, streamName)).length;
    }
    private getDepth({ traceId }: OutgoingMessage<AnyMessage>): number {
        return this._log.filter(m => m.traceId === traceId).length;
    }
}

export class MessageStore implements MessageStore {
    private _emitter: EventEmitter;
    private _messageStream: Observable<StoredMessage<AnyMessage>>;
    private _subscriptions: Subscription[];
    private constructor(
        private _db: MessageStoreDB,
    ) {
        this._emitter = new EventEmitter({ captureRejections: true });
        const obs = fromEvent(this._emitter, 'message') as Observable<StoredMessage<AnyMessage>>;
        this._messageStream = obs.pipe(
            shareReplay({
                bufferSize: 1000,
                refCount: false,
            }),
        );
        this._subscriptions = [];
    }
    public static create(db: MessageStoreDB): MessageStore {
        return new MessageStore(db);
    }

    public async logMessage(message: OutgoingMessage<AnyMessage>): Promise<LogResult> {
        const result = this._db.logMessage(message);
        this._emitter.emit('message', message);
        return result;
    }

    public bind<M extends AnyMessage>(dispatcher: Dispatcher<M>): void {
        const existingMessages = this._db.getDispatcherStream<M>(dispatcher);
        const message$ = concat(existingMessages, this._messageStream);
        const sub = message$.pipe(
            distinct(({ id }) => id),
            filter(msg => dispatcher.filter(msg)),
            concatMap(msg => dispatcher.handle(msg as any)),
        ).subscribe();
        this._subscriptions.push(sub);
    }

    public async stopDispatchers(): Promise<void> {
        await Promise.all(this._subscriptions.map(async sub => {
            sub.unsubscribe();
        }));
    }
}