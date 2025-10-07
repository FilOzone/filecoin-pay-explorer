// Re-export all generated GraphQL types
export * from "./generated/graphql";

export type Hex = `0x${string}`;
export type Address = Hex;
export type Bytes = Hex;
export type TransactionHash = Hex;
export type BigInt = bigint;
