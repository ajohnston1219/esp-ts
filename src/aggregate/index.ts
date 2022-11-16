import { concatMap, lastValueFrom, Observable, scan, tap } from 'rxjs';
import { TypeOf, z } from 'zod';
import { Component, ComponentConfig, ComponentHandlerFunction, ComponentMessageTypes, ComponentType, createComponent } from '../component';
import { getHandlerApi, Handler, HandlerMap, HandlerTags } from '../component/handler';
import { MessageResult } from '../message';
import { GetTaggedObject, SchemaType } from '../schema';
import { AggregateId, AnyChannelSchema, ChannelMessageType, ChannelName, ChannelTags } from '../stream';
import { KeysOfUnion } from '../utils/types';

export type ProjectionSuccess<State extends SchemaType> = {
    readonly _tag: 'Success';
    readonly state: AggregateState<State>;
}
export type ProjectionNotFound = {
    readonly _tag: 'NotFound';
}
export type ProjectionSuccessWithVersion<S extends SchemaType> = ProjectionSuccess<S> & { version: number };
export type ProjectionFailure<FR extends string> = {
    readonly _tag: 'Failure';
    readonly reason: FR;
    readonly message: string;
}
export type ProjectionResult<S extends SchemaType, FR extends string> = ProjectionSuccess<S> | ProjectionFailure<FR>;
export type ProjectionResultWithVersion<S extends SchemaType, FR extends string> = ProjectionSuccessWithVersion<S> | ProjectionFailure<FR>;
export type ProjectionFetchResult<S extends SchemaType, FR extends string> = ProjectionResult<S, FR> | ProjectionNotFound;
export type ProjectionFetchResultWithVersion<S extends SchemaType, FR extends string> = ProjectionResultWithVersion<S, FR> | ProjectionNotFound;
export type ProjectionAPI<S extends SchemaType, FR extends string> = {
    readonly success: (state: AggregateState<S>) => ProjectionSuccess<S>;
    readonly failure: (reason: FR, message: string) => ProjectionFailure<FR>;
}
export type ProjectionAPIWithVersion<S extends SchemaType, FR extends string> = {
    readonly success: (state: AggregateState<S>, version: number) => ProjectionSuccess<S> & { version: number };
    readonly failure: (reason: FR, message: string) => ProjectionFailure<FR>;
}
export type ProjectionFetchAPI<S extends SchemaType, FR extends string> = {
    readonly notFound: () => ProjectionNotFound;
} & ProjectionAPIWithVersion<S, FR>;
export type AggregateProjectionFunction<S extends SchemaType, EventSchema extends AnyChannelSchema, FR extends string> =
    (api: ProjectionAPI<S, FR>) => (state: AggregateState<S>, event: MessageResult<ChannelMessageType<EventSchema, ChannelTags<EventSchema>>>) => ProjectionResult<S, FR>;

export interface AggregateSchema<StateSchema extends SchemaType, CommandSchema extends AnyChannelSchema, EventSchema extends AnyChannelSchema> {
    readonly state: StateSchema;
    readonly commands: {
        [Tag in CommandSchema['_tag']]: GetTaggedObject<CommandSchema, Tag>;
    }
    readonly events: {
        [Tag in EventSchema['_tag']]: GetTaggedObject<EventSchema, Tag>;
    }
}
export interface AggregateConfig<Name extends string, StateSchema extends SchemaType, CommandSchema extends AnyChannelSchema, EventSchema extends AnyChannelSchema, OutTags extends HandlerTags<EventSchema>> {
    readonly name: Name;
    readonly initialState: TypeOf<StateSchema>;
    readonly schema: {
        readonly state: StateSchema;
        readonly commands: {
            [Tag in ChannelName<CommandSchema>]: GetTaggedObject<CommandSchema, Tag>;
        }
        readonly events: {
            [Tag in ChannelName<EventSchema>]: GetTaggedObject<EventSchema, Tag>;
        }
    };
    readonly handlers: {
        [N in ChannelName<CommandSchema>]: CommandSchema extends { readonly _tag: N }
            ? { [Tag in ChannelTags<GetTaggedObject<CommandSchema, N>>]: Handler<GetTaggedObject<CommandSchema, N>, Tag, EventSchema, OutTags> }
            : never;
    };
}

export type SomeAggregateConfig<N extends string, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema> = AggregateConfig<N, S, In, Out, HandlerTags<Out>>;
export type AggregateState<S extends SchemaType> = z.infer<S>;
type ChannelType = 'commands' | 'events';
export type ChannelKeys<A extends AggregateSchema<S, In, Out>, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, CT extends ChannelType> = KeysOfUnion<A[CT]>;
export type ChannelSchema<A extends AggregateSchema<S, In, Out>, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, CT extends ChannelType, N extends ChannelKeys<A, S, In, Out, CT>> = A[CT][N];
export type CommandSchema<A extends AggregateSchema<S, In, Out>, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, N extends ChannelKeys<A, S, In, Out, 'commands'>> = ChannelSchema<A, S, In, Out, 'commands', N>;
export type EventSchema<A extends AggregateSchema<S, In, Out>, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, N extends ChannelKeys<A, S, In, Out, 'events'>> = ChannelSchema<A, S, In, Out, 'events', N>;
export type CommandSchemas<Config extends AggregateSchema<S, In, Out>, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, N extends KeysOfUnion<Config['commands']>> = Config['commands'][N];
export type EventSchemas<Config extends AggregateSchema<S, In, Out>, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, N extends KeysOfUnion<Config['events']>> = Config['events'][N];
export type AggregateMessageType<A extends SomeAggregateConfig<N, S, In, Out>, N extends string, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, CT extends ChannelType> =
    ComponentMessageTypes<AggregateComponent<A, N, S, In, Out>, CT extends 'commands' ? 'In' : 'Out'>;

export type AggregateComponent<A extends SomeAggregateConfig<N, S, In, Out>, N extends string, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema> =
    ComponentConfig<A['name'], In, Out>;

export type HydrateFunction<S extends SchemaType, EventSchema extends AnyChannelSchema, FR extends string> =
    (id: AggregateId, event$: Observable<MessageResult<ChannelMessageType<EventSchema, ChannelTags<EventSchema>>>>) => Promise<ProjectionResultWithVersion<S, FR>>;
export interface Aggregate<N extends string, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, OutTags extends HandlerTags<Out>, FailureReason extends string> {
    readonly config: AggregateConfig<N, S, In, Out, OutTags>;
    readonly component: Component<ComponentConfig<N, In, Out>, In, Out, FailureReason>;
    readonly get: ReturnType<GetAggregateFunction<S, FailureReason>>;
    readonly hydrate: HydrateFunction<S, Out, FailureReason>;
}
export type GetAggregateFunction<S extends SchemaType, FR extends string> = (api: ProjectionFetchAPI<S, FR>) => (id: AggregateId) =>
    Promise<ProjectionFetchResultWithVersion<S, FR>>;
export type UpdateAggregateFunction<S extends SchemaType, FR extends string> = (api: ProjectionAPI<S, FR>) => (id: AggregateId, state: AggregateState<S>, version: number) =>
    Promise<ProjectionResult<S, FR>>;
export type AggregateHandlerFunction<A extends SomeAggregateConfig<N, S, In, Out>, N extends string, S extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, FR extends string> =
    ComponentHandlerFunction<AggregateComponent<A, N, S, In, Out>, In, Out, FR>;

export type AggregateCreateConfig<Name extends string, StateSchema extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, OutTags extends HandlerTags<Out>, FR extends string> = {
    readonly project: AggregateProjectionFunction<StateSchema, Out, FR>;
    readonly get: GetAggregateFunction<StateSchema, FR>;
    readonly update: UpdateAggregateFunction<StateSchema, FR>;
} & AggregateConfig<Name, StateSchema, In, Out, OutTags>;
export function createAggregate<Name extends string, StateSchema extends SchemaType, In extends AnyChannelSchema, Out extends AnyChannelSchema, OutTags extends HandlerTags<Out>, FR extends string>({
    name, initialState, schema, project, get, update, handlers,
}: AggregateCreateConfig<Name, StateSchema, In, Out, OutTags, FR>): Aggregate<Name, StateSchema, In, Out, OutTags, FR> {

    type Comp = Component<ComponentConfig<Name, In, Out>, In, Out, FR>;
    const api: ProjectionAPI<StateSchema, FR> = {
        success: (state) => ({ _tag: 'Success', state }),
        failure: (reason, message) => ({ _tag: 'Failure', reason, message }),
    }
    const internalApi: ProjectionAPIWithVersion<StateSchema, FR> = {
        success: (state, version) => ({ _tag: 'Success', state, version }),
        failure: (reason, message) => ({ _tag: 'Failure', reason, message }),
    }
    const fetchApi: ProjectionFetchAPI<StateSchema, FR> = {
        ...internalApi,
        notFound: () => ({ _tag: 'NotFound' }),
    };

    const handler: ComponentHandlerFunction<Comp['config'], In, Out, FR> = (c) => async (incoming) => {
        const { traceId, message, streamName } = incoming;
        const { _tag } = message;
        const { channel } = streamName;
        if (channel in handlers) {
            const handler = (handlers as any)[channel] as unknown as HandlerMap<ChannelName<In>, In, Out, OutTags>;
            if (_tag in handler) {
                const handle = (handler as any)[_tag] as unknown as Handler<In, ChannelTags<In>, Out, OutTags>;
                const api = getHandlerApi(traceId, handle.config.schema.output, msg => c.sendRaw(msg));
                // TODO(adam): Better error handling
                try {
                    await handle.execute(api)(incoming as any);
                    return c.success();
                } catch (err: any) {
                    return c.failure('Unknown' as any, err.message);
                }
            }
        }
        return c.success(); // TODO(adam): Ignore result type
    }

    const config: AggregateConfig<Name, StateSchema, In, Out, OutTags> = {
        name,
        initialState,
        schema,
        handlers,
    }

    const component: ComponentType<Comp['config'], In, Out, FR> = createComponent({
        name: config.name,
        inputChannels: config.schema.commands as any,
        outputChannels: config.schema.events as any,
    }, handler) as unknown as ComponentType<Comp['config'], In, Out, FR>;

    const doProject = async (message: MessageResult<any>) => {
        const getResult = await get(fetchApi)(message.streamName.id);
        if (getResult._tag === 'Failure') {
            return { ...getResult, traceId: message.traceId };
        }
        let result: ProjectionResult<StateSchema, FR>;
        const version = getResult._tag === 'NotFound' ? 0 : getResult.version;
        if (getResult._tag === 'NotFound') {
            result = project(api)(config.initialState, message);
        } else {
            result = project(api)(getResult.state, message);
        }
        if (result._tag === 'Failure') {
            return { ...result, traceId: message.traceId };
        }
        const updateResult = await update(api)(message.streamName.id, result.state, version + 1);
        return { ...updateResult, traceId: message.traceId };
    }

    const hydrate: HydrateFunction<StateSchema, Out, FR> = async (id, event$) => {
        const obs = event$.pipe(
            scan((lastResult, event, index) => {
                if (lastResult._tag === 'Failure') {
                    return lastResult;
                }
                const result = project(api)(lastResult.state, event);
                return { ...result, version: index + 1 };
            }, { _tag: 'Success', state: config.initialState, version: 0 } as ProjectionResultWithVersion<StateSchema, FR>),
        );
        const result = await lastValueFrom(obs, { defaultValue: null });
        if (result === null) {
            const newResult = internalApi.success(config.initialState, 0);
            return newResult;
        }
        if (result._tag === 'Failure') {
            return result;
        }
        const updateResult = await update(api)(id, result.state, result.version);
        return { ...updateResult, version: result.version };
    }

    component.outbox.pipe(concatMap(async msg => await doProject(msg))).subscribe();

    return {
        config,
        component,
        get: get(fetchApi),
        hydrate,
    };
}