// Owns the "which token to pay in" form state. Transaction orchestration
// lives in useAddServiceLifecycle; service selection in useServiceSelection.
import { useCallback, useState } from "react";
import { erc20Abi, type Hex, isAddress, zeroAddress } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { paymentTokensByChainId } from "@/constants/payment-tokens";
import useSynapse from "@/hooks/useSynapse";
import { getPermitDomainSeparator } from "@/utils/permit";
import { CUSTOM_OPTION } from "./constants";

/** A payment token the dialog can act on, curated or resolved from chain reads. */
export interface PaymentTokenDetails {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
}

/** How far the hand-entered custom token address has got towards a usable token. */
export type CustomTokenState = "idle" | "invalid" | "loading" | "error" | "loaded";

// The deposit path signs an EIP-2612 permit, so a custom token must expose
// nonces() for depositWithPermitAndApproveOperator to work at all. Probed with
// the zero address — any owner works for a support check.
const permitNoncesAbi = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const permitDomainSeparatorAbi = [
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export interface TokenSelection {
  knownTokens: PaymentTokenDetails[];
  tokenChoice: string;
  chooseToken: (value: string) => void;
  customTokenInput: string;
  enterCustomTokenAddress: (value: string) => void;
  token: PaymentTokenDetails | null;
  /** Curated tokens are permit-verified; custom tokens must pass the permit-domain probes. */
  supportsPermit: boolean;
  customTokenState: CustomTokenState;
  balance: bigint | undefined;
  isLoadingBalance: boolean;
  reset: () => void;
}

export function useTokenSelection(open: boolean): TokenSelection {
  const { constants } = useSynapse();
  const { address: userAddress } = useAccount();

  const knownTokens: PaymentTokenDetails[] = paymentTokensByChainId[constants.chain.id] ?? [];
  const [tokenChoice, chooseToken] = useState("");
  const [customTokenInput, enterCustomTokenAddress] = useState("");

  const selectedKnown = tokenChoice !== CUSTOM_OPTION ? knownTokens.find((t) => t.address === tokenChoice) : undefined;
  const trimmedCustomInput = customTokenInput.trim();
  const isCustomAddressValid = isAddress(trimmedCustomInput);
  const customTokenAddress: Hex | null =
    tokenChoice === CUSTOM_OPTION && isCustomAddressValid ? (trimmedCustomInput as Hex) : null;

  const {
    data: tokenReads,
    isLoading: isLoadingTokenReads,
    isError: isTokenReadsError,
  } = useReadContracts({
    contracts: customTokenAddress
      ? [
          { address: customTokenAddress, abi: erc20Abi, functionName: "symbol", chainId: constants.chain.id },
          { address: customTokenAddress, abi: erc20Abi, functionName: "decimals", chainId: constants.chain.id },
          { address: customTokenAddress, abi: erc20Abi, functionName: "name", chainId: constants.chain.id },
          {
            address: customTokenAddress,
            abi: permitNoncesAbi,
            functionName: "nonces",
            args: [zeroAddress],
            chainId: constants.chain.id,
          },
          {
            address: customTokenAddress,
            abi: permitDomainSeparatorAbi,
            functionName: "DOMAIN_SEPARATOR",
            chainId: constants.chain.id,
          },
        ]
      : [],
    query: { enabled: !!customTokenAddress && open },
  });
  const [symbolRead, decimalsRead, nameRead, noncesRead, domainSeparatorRead] = tokenReads ?? [];

  // All of symbol/decimals/name must succeed (allowFailure: true reports
  // per-result status, and the aggregate isError stays false on a single
  // revert): decimals guards deposit scaling, and the permit's EIP-712 domain
  // is built from name(), so a token missing it can't be signed for.
  const chainToken: PaymentTokenDetails | null =
    customTokenAddress &&
    symbolRead?.status === "success" &&
    decimalsRead?.status === "success" &&
    nameRead?.status === "success"
      ? {
          address: customTokenAddress,
          symbol: symbolRead.result as string,
          decimals: Number(decimalsRead.result),
          name: nameRead.result as string,
        }
      : null;

  const token = selectedKnown ?? chainToken;
  const supportsPermit = selectedKnown
    ? true
    : !!(
        chainToken?.name &&
        noncesRead?.status === "success" &&
        domainSeparatorRead?.status === "success" &&
        String(domainSeparatorRead.result).toLowerCase() ===
          getPermitDomainSeparator(customTokenAddress as Hex, chainToken.name, constants.chain.id)
      );

  // Checks ordered by precedence: an empty field never reports invalid, an
  // in-flight read never reports an error.
  const customTokenState: CustomTokenState = (() => {
    if (tokenChoice !== CUSTOM_OPTION || !trimmedCustomInput) return "idle";
    if (!isCustomAddressValid) return "invalid";
    if (isLoadingTokenReads) return "loading";
    if (isTokenReadsError || !chainToken) return "error";
    return "loaded";
  })();

  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: (token?.address as Hex | undefined) ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    chainId: constants.chain.id,
    query: { enabled: !!token && !!userAddress && open },
  });

  const reset = useCallback(() => {
    chooseToken("");
    enterCustomTokenAddress("");
  }, []);

  return {
    knownTokens,
    tokenChoice,
    chooseToken,
    customTokenInput,
    enterCustomTokenAddress,
    token,
    supportsPermit,
    customTokenState,
    balance,
    isLoadingBalance,
    reset,
  };
}
