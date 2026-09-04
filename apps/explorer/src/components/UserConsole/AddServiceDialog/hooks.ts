import { useState } from "react";
import { toast } from "sonner";
import { erc20Abi, type Hex, isAddress, zeroAddress } from "viem";
import {
  useAccount,
  useBalance,
  useConnection,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { paymentTokensByChainId } from "@/constants/payment-tokens";
import { type ApprovableService, useApprovableServices } from "@/hooks/useApprovableServices";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { getPermitDomainSeparator, getPermitSignature, type PermitSignature } from "@/utils/permit";
import { filecoinGasBalanceStatus } from "../FundsSection/data/filecoin-gas-balance";
import { FIL_GAS_TOP_UP_AMOUNT } from "../FundsSection/data/squid-deposit-route";

// A service contract reserves upcoming charges from the deposit for its lockup
// period (30 days for Filecoin Warm Storage Service), so the approval must
// allow at least that long. Submitted with every approval — 30 days in
// Filecoin epochs (2,880/day) — instead of asking users to reason about
// epochs.
const DEFAULT_MAX_LOCKUP_PERIOD = 86_400n;
const PERMIT_DEADLINE_SECONDS = 3600;

/** Sentinel for the "Custom … address" entries in both selects. */
export const CUSTOM_OPTION = "custom";

export interface ServiceSelection {
  services: ApprovableService[];
  isLoadingServices: boolean;
  serviceChoice: string;
  setServiceChoice: (value: string) => void;
  customServiceInput: string;
  setCustomServiceInput: (value: string) => void;
  selectedService: ApprovableService | undefined;
  operatorAddress: `0x${string}` | undefined;
  reset: () => void;
}

// Everything in this dialog — service list, token list, payments contract,
// permit domain — derives from the same useSynapse chain so a wallet/app
// network divergence can't mix networks within one submission.
export function useServiceSelection(): ServiceSelection {
  const { constants } = useSynapse();
  const [serviceChoice, setServiceChoice] = useState("");
  const [customServiceInput, setCustomServiceInput] = useState("");
  const { services, isLoading: isLoadingServices } = useApprovableServices({
    networkOverride: constants.chain.slug,
  });

  const selectedService =
    serviceChoice !== CUSTOM_OPTION ? services.find((s) => s.address === serviceChoice) : undefined;
  const operatorAddress: `0x${string}` | undefined = (() => {
    if (selectedService) return selectedService.address as `0x${string}`;
    const trimmed = customServiceInput.trim();
    if (serviceChoice === CUSTOM_OPTION && isAddress(trimmed)) return trimmed;
  })();

  const reset = () => {
    setServiceChoice("");
    setCustomServiceInput("");
  };

  return {
    services,
    isLoadingServices,
    serviceChoice,
    setServiceChoice,
    customServiceInput,
    setCustomServiceInput,
    selectedService,
    operatorAddress,
    reset,
  };
}

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
  setTokenChoice: (value: string) => void;
  customTokenInput: string;
  setCustomTokenInput: (value: string) => void;
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
  const [tokenChoice, setTokenChoice] = useState("");
  const [customTokenInput, setCustomTokenInput] = useState("");

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
          { address: customTokenAddress, abi: erc20Abi, functionName: "symbol" },
          { address: customTokenAddress, abi: erc20Abi, functionName: "decimals" },
          { address: customTokenAddress, abi: erc20Abi, functionName: "name" },
          { address: customTokenAddress, abi: permitNoncesAbi, functionName: "nonces", args: [zeroAddress] },
          { address: customTokenAddress, abi: permitDomainSeparatorAbi, functionName: "DOMAIN_SEPARATOR" },
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
    query: { enabled: !!token && !!userAddress && open },
  });

  const reset = () => {
    setTokenChoice("");
    setCustomTokenInput("");
  };

  return {
    knownTokens,
    tokenChoice,
    setTokenChoice,
    customTokenInput,
    setCustomTokenInput,
    token,
    supportsPermit,
    customTokenState,
    balance,
    isLoadingBalance,
    reset,
  };
}

export function useFilecoinGasBalance(open: boolean) {
  const { constants } = useSynapse();
  const { address: owner } = useAccount();
  const { chainId } = useConnection();
  const { isPending: isSwitchingNetwork, switchChain } = useSwitchChain();
  const query = useBalance({
    address: owner,
    chainId: constants.chain.id,
    query: { enabled: !!owner && open, refetchInterval: open ? 15_000 : false, refetchOnMount: "always" },
  });
  const status = filecoinGasBalanceStatus(
    query.data?.value,
    query.isFetching && query.data === undefined,
    query.isError,
    FIL_GAS_TOP_UP_AMOUNT,
  );
  const refresh = async () => {
    const result = await query.refetch();
    return filecoinGasBalanceStatus(result.data?.value, false, result.isError, FIL_GAS_TOP_UP_AMOUNT);
  };
  return {
    chainId,
    isCorrectChain: chainId === constants.chain.id,
    isSwitchingNetwork,
    owner,
    refresh,
    status,
    switchToFilecoin: () => switchChain({ chainId: constants.chain.id }),
    targetChainId: constants.chain.id,
  };
}

export interface SubmitArgs {
  operatorAddress: `0x${string}`;
  token: PaymentTokenDetails;
  /** Parsed deposit amount; null or 0n approves without depositing. */
  parsedDeposit: bigint | null;
  /** The deposit as the user typed it, for transaction toasts. */
  depositAmountLabel: string;
  lockupInWei: bigint;
  rateInWei: bigint;
}

export function useAddServiceSubmit(onSubmitOnChain: () => void) {
  const { constants } = useSynapse();
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { execute, isExecuting } = useContractTransaction({
    account: userAddress,
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    chainId: constants.chain.id,
    explorerUrl: constants.chain.blockExplorers?.default.url,
  });

  const submit = async ({
    operatorAddress,
    token,
    parsedDeposit,
    depositAmountLabel,
    lockupInWei,
    rateInWei,
  }: SubmitArgs) => {
    const tokenAddress = token.address as `0x${string}`;
    setIsSubmitting(true);
    try {
      if (parsedDeposit !== null && parsedDeposit > 0n) {
        if (!walletClient || !publicClient || !userAddress) {
          toast.error("Wallet not connected", { description: "Reconnect your wallet and try again." });
          return;
        }
        const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS);
        // execute() toasts its own failures; the permit signature is the one
        // step before it that can throw (signature declined, or a custom token
        // without EIP-2612 support), so surface that here.
        let permitSignature: PermitSignature;
        try {
          permitSignature = await getPermitSignature(
            {
              tokenAddress,
              tokenName: token.name,
              ownerAddress: userAddress,
              spenderAddress: constants.contracts.payments.address,
              amount: parsedDeposit,
              deadline,
              chainId: constants.chain.id,
            },
            walletClient,
            publicClient,
          );
        } catch (err) {
          console.error("Permit signature failed:", err);
          toast.error("Deposit authorization failed", {
            description: "The signature was declined, or this token does not support gasless approval (EIP-2612).",
          });
          return;
        }

        await execute({
          functionName: "depositWithPermitAndApproveOperator",
          args: [
            tokenAddress,
            userAddress,
            parsedDeposit,
            permitSignature.deadline,
            permitSignature.v,
            permitSignature.r,
            permitSignature.s,
            operatorAddress,
            rateInWei,
            lockupInWei,
            DEFAULT_MAX_LOCKUP_PERIOD,
          ],
          metadata: {
            type: "depositAndApprove",
            amount: depositAmountLabel,
            token: token.symbol,
            operator: operatorAddress,
          },
          onSubmitOnChain,
        });
      } else {
        await execute({
          functionName: "setOperatorApproval",
          args: [tokenAddress, operatorAddress, true, rateInWei, lockupInWei, DEFAULT_MAX_LOCKUP_PERIOD],
          metadata: {
            type: "approveOperator",
            operator: operatorAddress,
            token: token.symbol,
          },
          onSubmitOnChain,
        });
      }
    } catch (err) {
      // execute() already toasted; keep the full error for diagnostics.
      console.error("Add service failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submit, isSubmitting, isExecuting };
}
