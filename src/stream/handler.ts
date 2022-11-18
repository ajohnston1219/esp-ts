import { getMessageCreator, MessageHookFunction, MessageResult, MessageTag, TraceId } from "../message";
import { AnyChannelSchema, ChannelNames, ChannelTags, GetChannelMessageSchema, GetChannelMessageType } from "../schema/channel";
import { AggregateId, ChannelMessageCreatorsNoId, getStreamName } from "../stream";
import { KeysOfUnion } from "../utils/types";

export type HandlerTags<C extends AnyChannelSchema> = {
    [N in ChannelNames<C>]: C extends { readonly _tag: N }
        ? { [Tag in ChannelTags<C>]: boolean }
        : never;
}
export type HandlerTagUnion<CN extends ChannelNames<C>, C extends AnyChannelSchema, HT extends HandlerTags<C>> = KeysOfUnion<HT[CN]>;
export type HandlerChannel<CN extends ChannelNames<C>, C extends AnyChannelSchema, Tags extends HandlerTags<C>> = {
    readonly _tag: CN;
    channel: C;
    tags: Tags;
}
export type HandlerChannelSchema<C extends AnyChannelSchema, Tags extends HandlerTags<C>> = {
    [Tag in C['_tag']]: C extends { readonly _tag: Tag } ? HandlerChannel<Tag, C, Tags> : never;
}

export type HandlerInputSchema<In extends AnyChannelSchema, Tag extends ChannelTags<In>> = {
    readonly channel: In;
    readonly tag: Tag;
}
export type HandlerSchema<In extends AnyChannelSchema, InTag extends ChannelTags<In>, Out extends AnyChannelSchema, OutTags extends HandlerTags<Out>> = {
    readonly _tag: InTag;
    readonly input: HandlerInputSchema<In, InTag>;
    readonly output: HandlerChannelSchema<Out, OutTags>;
}

export type HandlerAPI<O extends AnyChannelSchema, Tags extends HandlerTags<O>> = {
    [Key in ChannelNames<O>]: O extends { readonly _tag: Key }
        ? (id: AggregateId) => ChannelMessageCreatorsNoId<O, Extract<ChannelTags<O>, KeysOfUnion<Tags[Key]>>>
        : never;
}
export type HandlerFunction<In extends AnyChannelSchema, InTag extends ChannelTags<In>, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>> =
    (api: HandlerAPI<Out, Tags>) => (message: MessageResult<GetChannelMessageType<In, InTag>>) => Promise<void>;

export type HandlerConfig<In extends AnyChannelSchema, InTag extends ChannelTags<In>, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>> = {
    readonly _tag: InTag;
    readonly schema: HandlerSchema<In, InTag, Out, Tags>;
}
export type Handler<In extends AnyChannelSchema, InTag extends ChannelTags<In>, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>> = {
    readonly _tag: InTag;
    readonly config: HandlerConfig<In, InTag, Out, Tags>;
    readonly execute: HandlerFunction<In, InTag, Out, Tags>;
}
export type SomeHandler<In extends AnyChannelSchema, Out extends AnyChannelSchema> = Handler<In, ChannelTags<In>, Out, HandlerTags<Out>>;

export type DefineHandlerConfig<In extends AnyChannelSchema, InTag extends ChannelTags<In>, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>> = {
    readonly tag: InTag;
    readonly input: HandlerInputSchema<In, InTag>;
    readonly output: HandlerChannelSchema<Out, Tags>;
    readonly handle: HandlerFunction<In, InTag, Out, Tags>;
}
export const defineHandler = <In extends AnyChannelSchema, InTag extends ChannelTags<In>, Out extends AnyChannelSchema, Tags extends HandlerTags<Out>>({
    tag, input, output, handle,
}: DefineHandlerConfig<In, InTag, Out, Tags>): Handler<In, InTag, Out, Tags> => ({
    _tag: tag,
    config: {
        _tag: tag,
        schema: {
            _tag: tag,
            input,
            output,
        },
    },
    execute: handle,
});

export const defineHandlerInput = <C extends AnyChannelSchema, Tag extends ChannelTags<C>>(channel: C, tag: Tag): HandlerInputSchema<C, Tag> => 
    ({ channel, tag });

export const defineHandlerChannel = <CN extends ChannelName<C>, C extends AnyChannelSchema, Tags extends [...ChannelTags<C>[]]>(
    name: CN,
    channel: C,
    ...tags: Tags
): HandlerChannel<CN, C, HandlerTags<C>> => ({
    _tag: name,
    channel,
    tags: Object.keys(channel.schema).reduce((acc, key) => ({ ...acc, [key]: tags.some(t => t === key) }), {} as any),
});
export const defineHandlerOutput = defineHandlerChannel;

export const defineHandlerChannels = <C extends HandlerChannel<string, AnyChannelSchema, HandlerTags<AnyChannelSchema>>[]>(
    ...channels: C
): HandlerChannelSchema<C[number]['channel'], HandlerTags<C[number]['channel']>> => channels.reduce((acc, { channel, tags }) => ({
    ...acc,
    [channel._tag]: { channel, tags },
}), {} as any);

export const defineHandlerOutputs = defineHandlerChannels;

export function getHandlerApi<C extends AnyChannelSchema, Tags extends HandlerTags<C>>(
    traceId: TraceId,
    schema: HandlerChannelSchema<C, Tags>,
    after?: MessageHookFunction<MessageType<ChannelMessageSchema<C, ChannelTags<C>>>>,
): HandlerAPI<C, Tags> {
    const creators = Object.keys(schema).reduce<HandlerAPI<C, Tags>>((acc, key) => {
        const hooks = after ? { after: [after] } : undefined;
        const curr = (schema as any)[key] as any;
        return {
            ...acc,
            [curr.channel._tag]: (id: AggregateId) =>
                Object.keys(curr.tags)
                    .filter(key => curr.tags[key])
                    .reduce((a: any, k: any) => ({
                            ...a,
                            [k]: getMessageCreator(k, getStreamName(curr.channel), hooks as any)(traceId)(id)
                    }), {} as any),
        }
    }, {} as unknown as HandlerAPI<C, Tags>);
    return creators;
}

export type HandlerMap<CN extends ChannelName<In>, In extends AnyChannelSchema, Out extends AnyChannelSchema, OutTags extends HandlerTags<Out>> = {
    readonly _tag: CN;
    readonly handlers: {
        [N in CN]: In extends { readonly _tag: N } ? {
            [Tag in ChannelTags<In>]: Handler<In, Tag, Out, OutTags>;
        } : never;
    }
}

export const defineHandlerMap = <CN extends ChannelName<In>, In extends AnyChannelSchema, Out extends AnyChannelSchema, OutTags extends HandlerTags<Out>>(
    name: CN,
    ...handlers: [...Handler<In, ChannelTags<In>, Out, OutTags>[]]
): HandlerMap<CN, In, Out, OutTags> => ({
    _tag: name,
    handlers: handlers.reduce((acc, curr) => {
        const channel = curr._tag;
        const messageTag = curr.config.schema.input.tag;
        if (channel in acc) {
            return { ...acc, [channel]: { ...(acc as any)[channel], [messageTag]: curr } };
        }
        return { ...acc, [channel]: { [messageTag]: curr } };
    }, {} as any),
})