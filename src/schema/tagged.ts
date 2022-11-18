// TODO(adam): Allow for override of tag name
export type TaggedObject<Tag extends string> = { readonly _tag: string };
export type AnyTaggedObject = TaggedObject<string>;
export type IsTagged<TO extends AnyTaggedObject, Tag extends string> =
    TO extends TaggedObject<Tag> ? true : false;
export type GetTaggedObject<TO extends AnyTaggedObject, Tag extends string> =
    IsTagged<TO, Tag> extends true ? TO : never;