import { TypeOf } from "zod";
import { TypeOfSchema } from ".";
import { AnyMessageSchema, IncomingMessage, Message, MessageCreatorNoId } from "../message";
import { AggregateId } from "../stream";
import { AnyChannelSchema, ChannelMessageSchemas, ChannelNames, ChannelTags, GetChannelMessageSchema } from "./channel";

type HandlerResultSuccess = { _tag: 'Success' };
type HandlerResultFailure<FR extends string> = { _tag: 'Failure', reason: FR, message: string };
type HandlerResultIgnore = { _tag: 'Ignore' };

export type HandlerResult<FR extends string> =
    | HandlerResultSuccess
    | HandlerResultFailure<FR>
    | HandlerResultIgnore;

type MessageSchemaArray<Tag extends ChannelNames<Out>, Schema extends Out['schema'][ChannelTags<Out>], Out extends AnyChannelSchema> = readonly [...{ _tag: Tag, schema: Schema }[]];
type AnyMessageSchemaArray<Out extends AnyChannelSchema> = MessageSchemaArray<ChannelNames<Out>, Out['schema'][ChannelTags<Out>], Out>;
type FailureArray = readonly [...string[]];
type HandlerOutput<Out extends AnyChannelSchema, M extends AnyMessageSchemaArray<Out>, F extends FailureArray> = {
    readonly output: M;
    readonly failures: F;
}
type InOutMap<In extends AnyChannelSchema, Out extends AnyChannelSchema, M extends AnyMessageSchemaArray<Out>, F extends FailureArray> = {
    [Tag in ChannelTags<In>]: HandlerOutput<Out, M, F>;
}

type MessageCreators<Schema extends AnyMessageSchema> = {
    [S in Schema as S['_tag']]: MessageCreatorNoId<Message<S['_tag'], TypeOf<S['schema']>>>
}

type HandlerAPI<Out extends AnyChannelSchema, Outputs extends HandlerOutput<Out, AnyMessageSchemaArray<Out>, FA>, FA extends FailureArray> = {
    readonly success: () => HandlerResultSuccess;
    readonly failure: (reason: FA[number], message: string) => HandlerResultFailure<FA[number]>;
    readonly ignore: () => HandlerResultIgnore;
    readonly send: {
        [S in Outputs['output'][number] as S['_tag']]: (id: AggregateId) => MessageCreators<S['schema']>;
    }
}

type SubscriptionFunction<M extends In['schema'][ChannelTags<In>], In extends AnyChannelSchema, Out extends AnyChannelSchema, Outputs extends HandlerOutput<Out, AnyMessageSchemaArray<Out>, FA>, FA extends FailureArray> =
    (api: HandlerAPI<Out, Outputs, FA>) => (incoming: IncomingMessage<Message<M['_tag'], TypeOfSchema<M>>>) => Promise<HandlerResult<Outputs['failures'][number]>>;

type SubscriptionHandler<M extends In['schema'][ChannelTags<In>], In extends AnyChannelSchema, Out extends AnyChannelSchema, Outputs extends InOutMap<In, Out, AnyMessageSchemaArray<Out>, FA>[M['_tag']], FA extends FailureArray> = {
    readonly _tag: M['_tag'];
    readonly input: In;
    readonly outputs: Outputs;
    readonly execute: SubscriptionFunction<M, In, Out, Outputs, FA>;
}

type SubscriptionHandlerMap<In extends AnyChannelSchema, Out extends AnyChannelSchema, IO extends InOutMap<In, Out, AnyMessageSchemaArray<Out>, FailureArray>> = {
    readonly [M in In['schema'][ChannelTags<In>]as M['_tag']]: SubscriptionHandler<M, In, Out, IO[M['_tag']], FailureArray>;
}
export type Subscription<In extends AnyChannelSchema, Out extends AnyChannelSchema, IO extends InOutMap<In, Out, AnyMessageSchemaArray<Out>, FailureArray>> = {
    readonly _tag: In['_tag'];
    readonly input: In;
    readonly handle: SubscriptionHandlerMap<In, Out, IO>;
}

export type HandlerConfig<Tag extends ChannelTags<In>, M extends In['schema'][Tag], In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], Outputs extends HandlerOutput<Out[number], AnyMessageSchemaArray<Out[number]>, Failures>, Failures extends FailureArray> = {
    readonly tag: Tag;
    readonly input: In;
    readonly outputs: Outputs;
    readonly execute: SubscriptionFunction<M, In, Out[number], Outputs, Failures>;
}

export function createHandler<Tag extends ChannelTags<In>, M extends In['schema'][Tag], In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], Outputs extends HandlerOutput<Out[number], AnyMessageSchemaArray<Out[number]>, Failures>, Failures extends FailureArray>({
    tag, input, outputs, execute,
}: HandlerConfig<Tag, M, In, Out, Outputs, Failures>): SubscriptionHandler<M, In, Out[number], Outputs, Failures> {
    return {
        _tag: tag,
        input,
        outputs,
        execute,
    }
}
type SomeHandler<In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], Failures extends FailureArray> =
    SubscriptionHandler<In['schema'][ChannelTags<In>], In, Out[number], InOutMap<In, Out[number], AnyMessageSchemaArray<Out[number]>, Failures>[ChannelTags<In>], Failures>;
type HandlerArray<In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], Failures extends FailureArray> =
    [...SomeHandler<In, Out, Failures>[]]

export class SubscriptionBuilder<In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], IO extends InOutMap<In, Out[number], AnyMessageSchemaArray<Out[number]>, FailureArray>, Handlers extends HandlerArray<In, Out, FailureArray>> {
    private constructor(
        private readonly input: In,
        private readonly output: Out,
        private readonly outputMap: IO,
        private readonly handlers: Handlers,
    ) {}

    public static create<In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]]>(input: In, ...output: Out) {
        type _IO = InOutMap<In, Out[number], AnyMessageSchemaArray<Out[number]>, FailureArray>;
        const outputMap: InOutMap<In, Out[number], AnyMessageSchemaArray<Out[number]>, FailureArray> = Object.keys(input.schema).reduce((acc, curr) => ({
            ...acc, [curr]: output.reduce((acc, c) => ({ ...acc, [c._tag]: [] }), {} as any),
        }), {} as _IO);
        return new SubscriptionBuilder<In, Out, _IO, []>(input, output, outputMap, []);
    }

    public handle<I extends In, Tag extends ChannelTags<I>, H extends SubscriptionHandler<I['schema'][Tag], I, Out[number], HandlerOutput<Out[number], AnyMessageSchemaArray<Out[number]>, FailureArray>, FailureArray>>(
        channel: I,
        tag: Tag,
        handler: H,
    ) {
        type _IO = IO & { [T in Tag]: H['outputs'] };
        type _H = typeof handler;
        type _Hs = [...(Handlers[number] | _H)[]];
        return new SubscriptionBuilder<In, Out, _IO, _Hs>(
            this.input,
            this.output,
            { ...this.outputMap, [tag]: handler.outputs },
            [ ...this.handlers, handler ],
        );
    }

    public build(): Subscription<In, Out[number], IO> {
        return {
            _tag: this.input._tag,
            input: this.input,
            handle: this.handlers.reduce((acc, curr) => ({
                ...acc,
                [curr._tag]: curr,
            }), {} as any),
        }
    }
}

type HandlerPair<Tag extends ChannelTags<In>, M extends In['schema'][Tag], In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], IO extends InOutMap<In, Out[number], AnyMessageSchemaArray<Out[number]>, FailureArray>> =
    [Tag, SubscriptionHandler<M, In, Out[number], IO[M['_tag']], FailureArray>];
export function createSubscription<Handlers extends SubscriptionHandlerMap<In, Out[number], IO>, In extends AnyChannelSchema, Out extends readonly [...AnyChannelSchema[]], IO extends InOutMap<In, Out[number], AnyMessageSchemaArray<Out[number]>, FailureArray>>(
    input: In,
    outputs: Out,
    handle: Handlers,
): Subscription<In, Out[number], IO> {
    return {
        _tag: input._tag, input,
        handle,
    }
}