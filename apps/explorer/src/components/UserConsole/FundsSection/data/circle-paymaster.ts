import { type Address, type Hex, type PublicClient, parseAbi } from "viem";
import { base } from "viem/chains";

/** Circle Paymaster v0.8 on Base: takes USDC for gas, paired with EntryPoint v0.8. */
export const CIRCLE_PAYMASTER_ADDRESS: Address = "0x0578cFB241215b77442a541325d6A4E6dFE700Ec";
/** The paymaster's only accepted token: native USDC on Base. */
export const CIRCLE_PAYMASTER_TOKEN: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const CIRCLE_PAYMASTER_TOKEN_DECIMALS = 6;
export const CIRCLE_PAYMASTER_CHAIN_ID = base.id;
/** Circle's quickstart value; covers the permit call and the USDC pull during validation. */
const PAYMASTER_VERIFICATION_GAS_LIMIT = 200_000n;
/** Circle documents up to a 10% surcharge; a higher live spread fails closed rather than charging more than reviewed. */
const MAX_PAYMASTER_FEE_SPREAD_BIPS = 1_000n;
/** The oracle price is read again at validation; the permit is signed for this much drift above the reviewed price. */
const PAYMASTER_PRICE_HEADROOM_BIPS = 1_000n;

const BIPS = 10_000n;

/** eth-infinitism Simple7702Account for EntryPoint v0.8, the delegate viem's `toSimple7702SmartAccount` signs for. */
export const SIMPLE_7702_ACCOUNT_ADDRESS: Address = "0xe6Cae83BdE06E4c305530e199D7217f42808555B";

const OUR_DELEGATION = `0xef0100${SIMPLE_7702_ACCOUNT_ADDRESS.slice(2)}`.toLowerCase();

/** `ours` reuses the delegation; `conflict` is another delegate (or a contract) the console must never overwrite. */
export function getDelegationState(code: Hex | undefined): "none" | "ours" | "conflict" {
  if (code === undefined || code === "0x") return "none";
  return code.toLowerCase() === OUR_DELEGATION ? "ours" : "conflict";
}

export const circlePaymasterAbi = parseAbi([
  "function additionalGasCharge() view returns (uint32)",
  "function feeSpread() view returns (uint32)",
  "function fetchPrice() view returns (uint256)",
  "event UserOperationSponsored(address indexed token, address indexed sender, bytes32 userOpHash, uint256 nativeTokenPrice, uint256 actualTokenNeeded, uint256 feeTokenAmount)",
]);

export interface PaymasterFees {
  /** Gas the paymaster bills on top of the operation's own; also the floor for the post-op gas limit. */
  additionalGasCharge: bigint;
  feeSpreadBips: bigint;
  /** USDC base units for 1 ETH. */
  nativeTokenPrice: bigint;
}

export interface UserOperationGas {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  maxFeePerGas: bigint;
}

export async function readPaymasterFees(client: Pick<PublicClient, "multicall">): Promise<PaymasterFees> {
  const [additionalGasCharge, feeSpread, nativeTokenPrice] = await client.multicall({
    allowFailure: false,
    contracts: [
      { abi: circlePaymasterAbi, address: CIRCLE_PAYMASTER_ADDRESS, functionName: "additionalGasCharge" },
      { abi: circlePaymasterAbi, address: CIRCLE_PAYMASTER_ADDRESS, functionName: "feeSpread" },
      { abi: circlePaymasterAbi, address: CIRCLE_PAYMASTER_ADDRESS, functionName: "fetchPrice" },
    ],
  });
  const fees = { additionalGasCharge: BigInt(additionalGasCharge), feeSpreadBips: BigInt(feeSpread), nativeTokenPrice };
  if (fees.feeSpreadBips > MAX_PAYMASTER_FEE_SPREAD_BIPS) {
    throw new Error("Circle's USDC gas surcharge is above 10%. Try again later.");
  }
  return fees;
}

/**
 * Validation reverts when the post-op limit is below `additionalGasCharge`, and a limit above 40,000 is billed
 * 10% of its excess over it; matching it exactly validates with no penalty.
 */
export function getPaymasterGasLimits(fees: Pick<PaymasterFees, "additionalGasCharge">) {
  return {
    paymasterVerificationGasLimit: PAYMASTER_VERIFICATION_GAS_LIMIT,
    paymasterPostOpGasLimit: fees.additionalGasCharge,
  };
}

/** USDC the paymaster pulls in `TokenPaymasterV08.validatePaymasterUserOp`; the unused part is refunded. */
export function getPaymasterPrefund(gas: UserOperationGas, fees: PaymasterFees): bigint {
  const maxCost =
    (gas.callGasLimit +
      gas.verificationGasLimit +
      gas.preVerificationGas +
      gas.paymasterVerificationGasLimit +
      gas.paymasterPostOpGasLimit) *
    gas.maxFeePerGas;
  const base = ((fees.additionalGasCharge * gas.maxFeePerGas + maxCost) * fees.nativeTokenPrice) / 10n ** 18n + 1n;
  return base + (base * fees.feeSpreadBips) / BIPS;
}

/** The USDC gas maximum the user reviews and the permit allows: the prefund at a price allowed to drift up. */
export function getPaymasterGasMaximum(gas: UserOperationGas, fees: PaymasterFees): bigint {
  const nativeTokenPrice = fees.nativeTokenPrice + (fees.nativeTokenPrice * PAYMASTER_PRICE_HEADROOM_BIPS) / BIPS;
  return getPaymasterPrefund(gas, { ...fees, nativeTokenPrice });
}
