/** The slice of Web Storage the funding trackers use, so tests can pass an in-memory map. */
export type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;
