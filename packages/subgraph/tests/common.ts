import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
// eslint-disable-next-line import/no-extraneous-dependencies
import { createMockedFunction } from "matchstick-as";

export const DEFAULT_PAYMENTS_CONTRACT_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000001");

export const DEFAULT_TOKEN_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000002");

export const DEFAULT_ACCOUNT_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000003");

export const DEFAULT_OPERATOR_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000004");

export const DEFAULT_NETWORK_FEE = BigInt.fromI64(10000000000000);

export function mockPaymentsContract(): void {
  createMockedFunction(DEFAULT_PAYMENTS_CONTRACT_ADDRESS, "NETWORK_FEE", "NETWORK_FEE():(uint256)").returns([
    ethereum.Value.fromUnsignedBigInt(DEFAULT_NETWORK_FEE),
  ]);
}

export function mockERC20Contract(tokenAddress: Address, name: string, symbol: string, decimals: i32): void {
  createMockedFunction(tokenAddress, "name", "name():(string)").returns([ethereum.Value.fromString(name)]);

  createMockedFunction(tokenAddress, "symbol", "symbol():(string)").returns([ethereum.Value.fromString(symbol)]);

  createMockedFunction(tokenAddress, "decimals", "decimals():(uint8)").returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(decimals)),
  ]);
}
