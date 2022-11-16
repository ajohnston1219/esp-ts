import { AnyMessageSchema, getMessageCreator, MessageHookFunction, MessageResult, MessageTag, MessageType, TraceId } from "../message";
import { AggregateId, AnyChannelSchema, ChannelMessageCreatorsNoId, ChannelMessageSchema, ChannelMessageType, ChannelTags, getMessageCreatorsNoId, getStreamName } from "../stream";

type HandlerTags<C extends AnyChannelSchema> = [...ChannelTags<C>[]];
type HandlerChannel<C extends AnyChannelSchema, Tags extends HandlerTags<C>> = {
    channel: C;
    tags: Tags;
}
export type HandlerChannelSchema<C extends AnyChannelSchema, Tags extends HandlerTags<C>> = {
    [Tag in C['_tag']]: C extends { readonly _tag: Tag } ? HandlerChannel<C, Tags> : never;
}

export type HandlerSchema<In extends AnyMessageSchema, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>> = {
    readonly _tag: MessageTag<In>;
    readonly input: In;
    readonly output: HandlerChannelSchema<Out, Tags>;
}

export type HandlerAPI<O extends AnyChannelSchema, Tags extends ChannelTags<O>> = {
    [Key in O['_tag']]: (id: AggregateId) => Pick<ChannelMessageCreatorsNoId<O>, Tags>;
}
export type HandlerFunction<In extends AnyMessageSchema, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>> =
    (api: HandlerAPI<Out, Tags[number]>) => (message: MessageResult<MessageType<In>>) => Promise<void>;

export type HandlerConfig<In extends AnyMessageSchema, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>> = {
    readonly _tag: MessageTag<In>;
    readonly schema: HandlerSchema<In, Out, Tags>;
}
export type AnyHandlerConfig = HandlerConfig<AnyMessageSchema, AnyChannelSchema, HandlerTags<AnyChannelSchema>>;

export type Handler<In extends AnyMessageSchema, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>> = {
    readonly _tag: MessageTag<In>;
    readonly config: HandlerConfig<In, Out, Tags>;
    readonly execute: HandlerFunction<In, Out, Tags>;
}

export type DefineHandlerConfig<In extends AnyMessageSchema, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>> = {
    readonly input: In;
    readonly output: HandlerChannelSchema<Out, Tags>;
    readonly handle: HandlerFunction<In, Out, Tags>;
}
export const defineHandler = <In extends AnyMessageSchema, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>>({
    input, output, handle,
}: DefineHandlerConfig<In, Out, Tags>): Handler<In, Out, Tags> => ({
    _tag: input.shape._tag.value,
    config: {
        _tag: input.shape._tag.value,
        schema: {
            _tag: input.shape._tag.value,
            input,
            output,
        },
    },
    execute: handle,
});

export const defineHandlerInput = <C extends AnyChannelSchema, Tag extends ChannelTags<C>>(
    channel: C,
    tag: Tag,
): ChannelMessageSchema<C, Tag> => channel.schema[tag] as unknown as ChannelMessageSchema<C, Tag>;

export const defineHandlerChannel = <C extends AnyChannelSchema, Tags extends HandlerTags<C>>(
    channel: C,
    tags: Tags,
): HandlerChannel<C, Tags> => ({
    channel,
    tags,
});
export const defineHandlerOutput = defineHandlerChannel;

export const defineHandlerChannels = <C extends HandlerChannel<AnyChannelSchema, HandlerTags<AnyChannelSchema>>[]>(
    ...channels: C
): HandlerChannelSchema<C[number]['channel'], HandlerTags<C[number]['channel']>> => channels.reduce((acc, { channel, tags }) => ({
    ...acc,
    [channel._tag]: { channel, tags },
}), {} as any);

export const defineHandlerOutputs = defineHandlerChannels;

export function getHandlerApi<C extends AnyChannelSchema, Tags extends HandlerTags<C>>(
    traceId: TraceId,
    schema: HandlerChannelSchema<C, Tags>,
    after?: MessageHookFunction<ChannelMessageType<C, Tags[number]>>,
): HandlerAPI<C, Tags[number]> {
    const creators = Object.keys(schema).reduce<HandlerAPI<C, Tags[number]>>((acc, key) => {
        const hooks = after ? { after: [after] } : undefined;
        const curr = (schema as any)[key] as unknown as HandlerChannel<C, Tags>;
        return {
            ...acc,
            [curr.channel._tag]: (id: AggregateId) =>
                curr.tags.reduce((a: any, c: any) => ({ ...a, [c]: getMessageCreator(c, getStreamName(curr.channel), hooks as any)(traceId)(id) }), {} as any),
        }
    }, {} as unknown as HandlerAPI<C, Tags[number]>);
    return creators;
}