import { AnyMessageSchema, getMessageCreator, IncomingMessage, MessageCreatorNoId, MessageHook, MessageType, TraceId } from "../message";
import { AggregateId, getStreamName } from "../stream";
import { KeysOfUnion } from "../utils/types";
import { AnyChannelSchema, ChannelSchema, ChannelSchemas, ChannelTags } from "./channel";
import { GetTag } from "./tagged";

type HandlerResultSuccess = { _tag: 'Success' };
type HandlerResultFailure<FR extends string> = { _tag: 'Failure', reason: FR, message: string };
type HandlerResultIgnore = { _tag: 'Ignore' };

export type HandlerResult<FR extends string> =
    | HandlerResultSuccess
    | HandlerResultFailure<FR>
    | HandlerResultIgnore;

type MessageSchemaArray<M extends ChannelSchemas<Out>, Out extends ChannelSchema<string, AnyMessageSchema, string>> =
    readonly [...[Out, [...M[]]][]];
export type AnyMessageSchemaArray<Out extends AnyChannelSchema> = MessageSchemaArray<ChannelSchemas<Out>, Out>;
type FailureArray = readonly [...string[]];
export type HandlerOutput<Out extends AnyChannelSchema, M extends AnyMessageSchemaArray<Out>, F extends FailureArray> = {
    readonly output: M;
    readonly failures: F;
}
export type InOutMap<In extends AnyChannelSchema, Out extends AnyChannelSchema, M extends AnyMessageSchemaArray<Out>, F extends FailureArray> = {
    [Tag in ChannelTags<In>]: HandlerOutput<Out, M, F>;
}

type MessageCreators<Schema extends AnyMessageSchema> = {
    [S in Schema as GetTag<Schema>]: MessageCreatorNoId<MessageType<S>>;
}

type HandlerAPI<Out extends AnyChannelSchema, Outputs extends HandlerOutput<Out, AnyMessageSchemaArray<Out>, FA>, FA extends FailureArray> = {
    readonly success: () => HandlerResultSuccess;
    readonly failure: (reason: FA[number], message: string) => HandlerResultFailure<FA[number]>;
    readonly ignore: () => HandlerResultIgnore;
    readonly send: {
        [O in Outputs['output'][number] as O[0]['name']]: (id: AggregateId) => MessageCreators<O[1][number]>;
    }
}

type SubscriptionFunction<M extends ChannelSchemas<In>, In extends AnyChannelSchema, Out extends AnyChannelSchema, Outputs extends HandlerOutput<Out, AnyMessageSchemaArray<Out>, FA>, FA extends FailureArray> =
    (api: HandlerAPI<Out, Outputs, FA>) => (incoming: IncomingMessage<MessageType<M>>) => Promise<HandlerResult<Outputs['failures'][number]>>;

export type SubscriptionHandler<M extends ChannelSchemas<In>, In extends AnyChannelSchema, Out extends AnyChannelSchema, Outputs extends InOutMap<In, Out, AnyMessageSchemaArray<Out>, FA>[M[0]], FA extends FailureArray> = {
    readonly _tag: GetTag<M>;
    readonly input: In;
    readonly outputs: Outputs;
    readonly execute: SubscriptionFunction<M, In, Out, Outputs, FA>;
}

type SubscriptionHandlerMap<In extends AnyChannelSchema, Out extends AnyChannelSchema, IO extends InOutMap<In, Out, AnyMessageSchemaArray<Out>, FailureArray>> = {
    readonly [M in ChannelSchemas<In> as GetTag<M>]: SubscriptionHandler<M, In, Out, IO[GetTag<M>], FailureArray>;
}
export type Subscription<N extends string, In extends AnyChannelSchema, Out extends AnyChannelSchema, IO extends InOutMap<In, Out, AnyMessageSchemaArray<Out>, FailureArray>> = {
    readonly name: N;
    readonly input: In;
    readonly outputs: readonly [...Out[]];
    readonly handle: SubscriptionHandlerMap<In, Out, IO>;
}
export type AnySubscription<In extends AnyChannelSchema, Out extends AnyChannelSchema> = Subscription<string, In, Out, InOutMap<In, Out, AnyMessageSchemaArray<Out>, FailureArray>>;
export type SubscriptionInput<S extends AnySubscription<In, Out>, In extends AnyChannelSchema = S['input'], Out extends AnyChannelSchema = AnyChannelSchema> =
    S['input'];
export type SubscriptionOutputs<In extends AnyChannelSchema, Out extends AnyChannelSchema, IO extends InOutMap<In, Out, AnyMessageSchemaArray<Out>, FailureArray>> =
    IO[KeysOfUnion<IO>]['output'][number][2]
export type SubscriptionInputMessage<In extends AnyChannelSchema> =
    MessageType<ChannelSchemas<In>>;

export type HandlerConfig<Tag extends ChannelTags<In>, M extends ChannelSchemas<In>, In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], Outputs extends HandlerOutput<Out[number], AnyMessageSchemaArray<Out[number]>, Failures>, Failures extends FailureArray> = {
    readonly tag: Tag;
    readonly input: In;
    readonly outputs: Outputs;
    readonly execute: SubscriptionFunction<M, In, Out[number], Outputs, Failures>;
}

export function createHandler<Tag extends ChannelTags<In>, M extends ChannelSchemas<In>, In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], Outputs extends HandlerOutput<Out[number], AnyMessageSchemaArray<Out[number]>, Failures>, Failures extends FailureArray>({
    tag, input, outputs, execute,
}: HandlerConfig<Tag, M, In, Out, Outputs, Failures>): SubscriptionHandler<M, In, Out[number], Outputs, Failures> {
    return {
        _tag: tag,
        input,
        outputs,
        execute,
    }
}

export function createSubscription<Handlers extends SubscriptionHandlerMap<In, Out[number], IO>, N extends string, In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], IO extends InOutMap<In, Out[number], AnyMessageSchemaArray<Out[number]>, FailureArray>>(
    name: N,
    input: In,
    outputs: Out,
    handle: Handlers,
): Subscription<N, In, Out[number], IO> {
    return {
        name,
        input,
        outputs,
        handle,
    }
}

export function getSubscriptionAPI<In extends AnyChannelSchema, Out extends AnyChannelSchema, Outputs extends HandlerOutput<Out, AnyMessageSchemaArray<Out>, FA>, FA extends FailureArray>(
    traceId: TraceId,
    tag: ChannelTags<In>,
    subscription: AnySubscription<In, Out>,
    hooks?: MessageHook<MessageType<ChannelSchemas<In>>>,
): HandlerAPI<Out, Outputs, FA> {
    const success = (): HandlerResultSuccess => ({ _tag: 'Success' });
    const failure = (reason: FA[number], message: string): HandlerResultFailure<FA[number]> => ({ _tag: 'Failure', reason, message });
    const ignore = (): HandlerResultIgnore => ({ _tag: 'Ignore' });
    const handler = subscription.handle[tag] as SubscriptionHandler<ChannelSchemas<In>, In, Out, Outputs, FA>;
    const send = handler.outputs.output.reduce((acc, [channel, schemas]) => ({
        ...acc,
        [channel.name]: (id: AggregateId) => schemas.reduce((a, [tag, m]) => ({
            ...a, [tag]: getMessageCreator(tag, getStreamName(channel), hooks)(traceId)(id),
        }), {} as any),
    }), {} as HandlerAPI<Out, Outputs, FA>['send']);

    return {
        success,
        failure,
        ignore,
        send,
    }
}