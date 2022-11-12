import { concatMap, lastValueFrom, mergeScan, Observable, scan } from 'rxjs';
import { z } from 'zod';
import { Component, ComponentConfig, ComponentHandlerFunction, ComponentMessageType, createComponent } from '../component';
import { MessageResult } from '../message';
import { AggregateId, AnyChannelSchema } from '../stream';
import { KeysOfUnion } from '../utils/types';

export type ProjectionSuccess<A extends AnyAggregateConfig> = {
    readonly _tag: 'Success';
    readonly state: AggregateState<A>;
}
export type ProjectionFailure<FR extends string> = {
    readonly _tag: 'Failure';
    readonly reason: FR;
    readonly message: string;
}
export type ProjectionResult<A extends AnyAggregateConfig, FR extends string> = ProjectionSuccess<A> | ProjectionFailure<FR>;
export type ProjectionAPI<A extends AnyAggregateConfig, FR extends string> = {
    readonly success: (state: AggregateState<A>) => ProjectionSuccess<A>;
    readonly failure: (reason: FR, message: string) => ProjectionFailure<FR>;
}
export type AggregateProjectionFunction<A extends AnyAggregateConfig, FR extends string> =
    (api: ProjectionAPI<A, FR>) => (state: AggregateState<A>, event: ComponentMessageType<AggregateComponent<A>, 'Out'>) => ProjectionResult<A, FR>;

export interface AggregateSchema<StateSchema extends Zod.ZodTypeAny, CommandSchema extends AnyChannelSchema, EventSchema extends AnyChannelSchema> {
    readonly state: StateSchema;
    readonly commands: {
        [Key in CommandSchema['name']]: CommandSchema
    }
    readonly events: {
        [Key in EventSchema['name']]: EventSchema;
    }
}
export type AnyAggregateSchema = AggregateSchema<Zod.ZodTypeAny, AnyChannelSchema, AnyChannelSchema>;

export interface AggregateConfig<Name extends string, A extends AnyAggregateSchema> {
    readonly name: Name;
    readonly initialState: z.infer<A['state']>;
    readonly schema: A;
}
export type AnyAggregateConfig = AggregateConfig<string, AnyAggregateSchema>;
export type AggregateState<A extends AnyAggregateConfig> = z.infer<A['schema']['state']>;
type ChannelType = 'commands' | 'events';
export type ChannelKeys<A extends AnyAggregateSchema, CT extends ChannelType> = KeysOfUnion<A[CT]>;
export type ChannelSchema<A extends AnyAggregateSchema, CT extends ChannelType, N extends ChannelKeys<A, CT>> = A[CT][N];
export type CommandSchema<A extends AnyAggregateSchema, N extends ChannelKeys<A, 'commands'>> = ChannelSchema<A, 'commands', N>;
export type EventSchema<A extends AnyAggregateSchema, N extends ChannelKeys<A, 'events'>> = ChannelSchema<A, 'events', N>;
export type CommandSchemas<Config extends AnyAggregateSchema, N extends KeysOfUnion<Config['commands']>> = Config['commands'][N];
export type EventSchemas<Config extends AnyAggregateSchema, N extends KeysOfUnion<Config['events']>> = Config['events'][N];

export type AggregateComponent<A extends AnyAggregateConfig> =
    ComponentConfig<
        A['name'],
        CommandSchemas<A['schema'], ChannelKeys<A['schema'], 'commands'>>,
        EventSchemas<A['schema'], ChannelKeys<A['schema'], 'events'>>
    >;

export type HydrateFunction<A extends AnyAggregateConfig, FR extends string> =
    (id: AggregateId, event$: Observable<ComponentMessageType<AggregateComponent<A>, 'Out'>>) => Promise<ProjectionResult<A, FR>>;
export interface Aggregate<Config extends AnyAggregateConfig, FailureReason extends string> {
    readonly config: Config;
    readonly component: Component<AggregateComponent<Config>, FailureReason>;
    readonly get: ReturnType<GetAggregateFunction<Config, FailureReason>>;
    readonly hydrate: HydrateFunction<Config, FailureReason>;
}
export type AnyAggregate = Aggregate<AnyAggregateConfig, string>;

export type GetAggregateFunction<A extends AnyAggregateConfig, FR extends string> = (api: ProjectionAPI<A, FR>) => (id: AggregateId) =>
    Promise<ProjectionResult<A, FR>>;
export type UpdateAggregateFunction<A extends AnyAggregateConfig, FR extends string> = (api: ProjectionAPI<A, FR>) => (id: AggregateId, state: AggregateState<A>) =>
    Promise<ProjectionResult<A, FR>>;
export type AggregateHandlerFunction<A extends AnyAggregateConfig, FR extends string> =
    ComponentHandlerFunction<AggregateComponent<A>, FR>;

export function createAggregate<Config extends AnyAggregateConfig, FailureReason extends string>(
    config: Config,
    handler: AggregateHandlerFunction<Config, FailureReason>,
    project: AggregateProjectionFunction<Config, FailureReason>,
    get: GetAggregateFunction<Config, FailureReason>,
    update: UpdateAggregateFunction<Config, FailureReason>,
): Aggregate<Config, FailureReason> {

    type Comp = AggregateComponent<Config>;
    const api: ProjectionAPI<Config, FailureReason> = {
        success: (state) => ({ _tag: 'Success', state }),
        failure: (reason, message) => ({ _tag: 'Failure', reason, message }),
    }

    const component = createComponent<Comp, FailureReason>({
        name: config.name,
        inputChannels: config.schema.commands as any,
        outputChannels: config.schema.events as any,
    }, handler);

    const doProject = async (event: MessageResult<any>) => {
        const getResult = await get(api)(event.aggregateId);
        if (getResult._tag === 'Failure') {
            return { ...getResult, traceId: event.traceId };
        }
        const result = project(api)(getResult.state, event);
        if (result._tag === 'Failure') {
            return { ...result, traceId: event.traceId };
        }
        const updateResult = await update(api)(event.aggregateId, result.state);
        return { ...updateResult, traceId: event.traceId };
    }

    const hydrate: HydrateFunction<Config, FailureReason> = async (id, event$) => {
        const obs = event$.pipe(
            scan((lastResult, event) => {
                if (lastResult._tag === 'Failure') {
                    return lastResult;
                }
                const result = project(api)(lastResult.state, event);
                return result;
            }, { _tag: 'Success', state: config.initialState } as ProjectionResult<Config, FailureReason>),
        );
        const result = await lastValueFrom(obs, { defaultValue: null });
        if (result === null) {
            return api.success(config.initialState);
        }
        if (result._tag === 'Failure') {
            return result;
        }
        const updateResult = await update(api)(id, result.state);
        return updateResult;
    }

    component.outbox.pipe(concatMap(msg => doProject(msg))).subscribe();

    return {
        config,
        component,
        get: get(api),
        hydrate,
    };
}