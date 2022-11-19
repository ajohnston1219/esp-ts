import { KeysOfUnion } from "../utils/types";

// TODO(adam): Allow for override of tag name
export type TaggedObject<Tag extends string, T> = readonly [ Tag, T ];
export type SomeTaggedObject<T> = TaggedObject<string, T>;
export type AnyTaggedObject = TaggedObject<string, any>;
export type GetTaggedObject<TO extends AnyTaggedObject, Tag extends string> =
    IsTagged<TO, Tag> extends true ? TO : never;
export type GetTag<TO extends AnyTaggedObject> = TO[0];
export type GetObject<TO extends AnyTaggedObject> = TO[1];
export type IsTagged<TO extends AnyTaggedObject, Tag extends string> =
    TO extends readonly [ Tag, any ] ? true : false;

export type TaggedArray<TO extends AnyTaggedObject> = readonly [...TO[]];
export type AnyTaggedArray = TaggedArray<AnyTaggedObject>;
export type GetTaggedObjectFromArray<TA extends AnyTaggedArray, Tag extends string> =
    GetTaggedObject<TA[number], Tag>;

export type TaggedMap<TO extends AnyTaggedObject> = {
    [O in TO as TO[0]]: TO;
}
export type AnyTaggedMap = TaggedMap<AnyTaggedObject>;
export type GetTaggedObjectFromMap<TM extends AnyTaggedMap, Tag extends string> =
    GetTaggedObject<TM[KeysOfUnion<TM>], Tag>;

export type TaggedMapFromArray<TA extends AnyTaggedArray> = {
    [TO in TA[number] as TO[0]]: TO;
}
export type TaggedArrayFromMap<TM extends AnyTaggedMap> = TaggedArray<TM[KeysOfUnion<TM>]>;
