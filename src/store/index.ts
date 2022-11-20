import { AnyMessage, generateMessageId, OutgoingMessage, StoredMessage, TraceId } from '../message';
import { AggregateId, channelEquals, streamEquals } from '../stream';
import { concat, concatMap, distinct, filter, from, fromEvent, map, Observable, shareReplay, Subscription } from 'rxjs';
import { EventEmitter } from 'events';
import { Dispatcher } from './dispatcher';
import { SomeComponent } from '../component';
// import { Aggregate, AggregateConfig, ProjectionResultWithVersion } from '../aggregate';
import { AnyChannelSchema } from '../schema/channel';

interface LogResult {
    readonly id: AggregateId;
    readonly version: number;
    readonly depth: number;
}

// export type AggregateResult<S extends SchemaType, FR extends string> = ProjectionResultWithVersion<S, FR>;

interface MessageStoreDB {
    logMessage(message: OutgoingMessage<AnyMessage>): Promise<LogResult>;
    getTrace(traceId: TraceId): Promise<StoredMessage<AnyMessage>[]>;
    // getAggregateStream: <S extends SchemaType, Out extends AnyChannelSchema>(config: AggregateConfig<string, S, AnyChannelSchema, Out, HandlerTags<Out>>) => (id: AggregateId) =>
    //     Observable<StoredMessage<MessageType<ChannelSchemas<Out>>>>
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
        const id = generateMessageId();
        const version = this.getAggregateVersion(_message) + 1;
        const channelVersion = this.getChannelVersion(_message) + 1;
        const depth = this.getDepth(_message);
        const message: StoredMessage<AnyMessage> = { id, version, channelVersion, depth, ..._message };
        this._log.push(message);
        return { id, version, depth };
    }

    public async getTrace(traceId: string): Promise<StoredMessage<AnyMessage>[]> {
        return this._log.filter(m => m.traceId === traceId);
    }

    // public getAggregateStream<S extends SchemaType, Out extends AnyChannelSchema>(
    //     config: AggregateConfig<string, S, AnyChannelSchema, Out, HandlerTags<Out>>
    // ): (id: AggregateId) => Observable<StoredMessage<MessageType<ChannelSchemas<Out>>>> {
    //     type Msg = StoredMessage<MessageType<ChannelSchemas<Out>>>;
    //     const fn = (id: AggregateId) => {
    //         const match = (msg: Msg) => {
    //             return (
    //                 Object.keys(config.schema.events).some(key => {
    //                     const eventSchema = (config.schema.events as any)[key];
    //                     return (
    //                         eventSchema.service === msg.streamName.service
    //                         && eventSchema._tag === msg.streamName.channel
    //                         && id === msg.streamName.id
    //                     );
    //                 })
    //             );
    //         };
    //         return from(this._log as Msg[]).pipe(
    //             filter(msg => match(msg)),
    //         );
    //     }
    //     return fn;
    // }

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
            distinct(({ id }) => id),
            shareReplay({
                bufferSize: 1000, // TODO(adam): Configurable
                refCount: false,
            }),
        );
        this._subscriptions = [];
    }
    public static create(db: MessageStoreDB): MessageStore {
        return new MessageStore(db);
    }

    public async logMessage(message: OutgoingMessage<AnyMessage>): Promise<LogResult> {
        const result = await this._db.logMessage(message);
        this._emitter.emit('message', message);
        return result;
    }

    public async getTrace(traceId: TraceId): Promise<StoredMessage<AnyMessage>[]> {
        return this._db.getTrace(traceId);
    }

    public bindDispatcher<M extends AnyMessage>(dispatcher: Dispatcher<M>): void {
        const existingMessages = this._db.getDispatcherStream<M>(dispatcher);
        const message$ = concat(existingMessages, this._messageStream);
        const sub = message$.pipe(
            distinct(({ id }) => id),
            filter(msg => dispatcher.filter(msg)),
            concatMap(msg => dispatcher.handle(msg as any)),
        ).subscribe();
        this._subscriptions.push(sub);
    }

    public bindOutputStream<M extends AnyMessage>(output: Observable<OutgoingMessage<M>>): void {
        const sub = output.pipe(
            concatMap(msg => this.logMessage(msg)),
            // TODO(adam): Handle Log Failure (make sure to include Trace ID)
        ).subscribe();
        this._subscriptions.push(sub);
    }

    public bindComponent<C extends SomeComponent<In, Out>, In extends AnyChannelSchema, Out extends AnyChannelSchema>(component: C): void {
        const dispatcher = Dispatcher.fromComponent(component);
        this.bindDispatcher(dispatcher);
        this.bindOutputStream(component.outbox.pipe(
            map((outgoing) => {
                const { message, traceId, streamName } = outgoing;
                const result: OutgoingMessage<AnyMessage> = {
                    traceId, streamName,
                    message: message.payload ? {
                        _tag: message._tag,
                        payload: message.payload,
                    } : {
                        _tag: message._tag,
                    } as any,
                }
                return result;
            }),
        ));
    }

    // public bindAggregate<A extends AggregateConfig<string, S, In, Out, OutTags>, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, OutTags extends HandlerTags<Out>>(aggregate: Aggregate<A['name'], S, In, Out, OutTags, string>): void {
    //     this.bindComponent(aggregate.component as any);
    // }

    // public getAggregate<N extends string, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, OutTags extends HandlerTags<Out>, FR extends string>(
    //     aggregate: Aggregate<N, S, In, Out, OutTags, FR>,
    // ): (id: AggregateId) => Promise<AggregateResult<S, FR>> {
    //     return async (id: AggregateId) => {
    //         const stream = this._db.getAggregateStream<S, Out>(aggregate.config as any)(id);
    //         const result = await aggregate.hydrate(id, stream as any);
    //         return result as AggregateResult<S, FR>;
    //     }
    // }

    public async stopDispatchers(): Promise<void> {
        await Promise.all(this._subscriptions.map(async sub => {
            sub.unsubscribe();
        }));
    }
}