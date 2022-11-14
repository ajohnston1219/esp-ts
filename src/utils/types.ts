export type KeysOfUnion<T> = T extends T ? keyof T : never;
export type RenameObject<T, K extends keyof any> = T extends object
  ? { [P in K]: T[keyof T] }
  : T;

export type Rename<T extends object, K extends keyof any> = T extends Array<any>
  ? { [I in keyof T]: RenameObject<T[I], K> }
  : RenameObject<T, K>;
