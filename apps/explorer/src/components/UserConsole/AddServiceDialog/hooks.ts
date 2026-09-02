import { useState } from "react";
import { toast } from "sonner";
import { erc20Abi, type Hex, isAddress, zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import { useTransactionReview } from "@/components/UserConsole/TransactionReview";
import { paymentTokensByChainId } from "@/constants/payment-tokens";
import { type ApprovableService, useApprovableServices } from "@/hooks/useApprovableServices";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { getPermitSignature, type PermitSignature } from "@/utils/permit";

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

export interface TokenSelection {
  knownTokens: PaymentTokenDetails[];
  tokenChoice: string;
  setTokenChoice: (value: string) => void;
  customTokenInput: string;
  setCustomTokenInput: (value: string) => void;
  token: PaymentTokenDetails | null;
  /** Curated tokens are permit-verified; custom tokens must pass the nonces() probe. */
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
        ]
      : [],
    query: { enabled: !!customTokenAddress && open },
  });
  const [symbolRead, decimalsRead, nameRead, noncesRead] = tokenReads ?? [];

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
  const supportsPermit = selectedKnown ? true : noncesRead?.status === "success";

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
  const { requestReview, reviewDialog } = useTransactionReview();
  const { constants } = useSynapse();
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
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

    // Embedded wallets sign without any wallet prompt, so the console shows
    // its own review step first (once per action; user can opt out).
    const isDepositing = parsedDeposit !== null && parsedDeposit > 0n;
    const approved = await requestReview({
      title: isDepositing
        ? `Deposit ${depositAmountLabel} ${token.symbol} and approve service`
        : `Approve service ${operatorAddress.slice(0, 6)}…${operatorAddress.slice(-4)}`,
      rows: [
        ...(isDepositing ? [{ label: "Deposit", value: `${depositAmountLabel} ${token.symbol}` }] : []),
        { label: "Service (operator)", value: operatorAddress },
        { label: "Token", value: `${token.symbol} ${tokenAddress}` },
        { label: "Rate allowance", value: rateInWei.toString() },
        { label: "Lockup allowance", value: lockupInWei.toString() },
        { label: "Network", value: constants.chain.name },
      ],
      details: JSON.stringify(
        {
          function: isDepositing ? "depositWithPermitAndApproveOperator" : "setOperatorApproval",
          token: tokenAddress,
          operator: operatorAddress,
          depositWei: isDepositing ? String(parsedDeposit) : "0",
          rateAllowanceWei: rateInWei.toString(),
          lockupAllowanceWei: lockupInWei.toString(),
          maxLockupPeriod: DEFAULT_MAX_LOCKUP_PERIOD.toString(),
          chainId: constants.chain.id,
        },
        null,
        2,
      ),
    });
    if (!approved) return;

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
        const signPermit = async (): Promise<PermitSignature | null> => {
          try {
            return await getPermitSignature(
              {
                tokenAddress,
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
            return null;
          }
        };
        const submitDeposit = (permitSignature: PermitSignature) =>
          execute({
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

        const permitSignature = await signPermit();
        if (!permitSignature) return;
        try {
          await submitDeposit(permitSignature);
        } catch (err) {
          // Load-balanced RPCs can serve the permit nonce or gas estimation
          // from a lagging replica, rejecting a correct signature; one re-sign
          // with a freshly read nonce resolves it. See DepositDialog.
          if (!(err instanceof Error && err.message.includes("EIP2612: invalid signature"))) throw err;
          console.warn("[AddService] Stale-replica permit revert; retrying once with a fresh nonce...");
          await new Promise((resolve) => setTimeout(resolve, 4000));
          const retrySignature = await signPermit();
          if (!retrySignature) return;
          await submitDeposit(retrySignature);
        }
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

  return { submit, isSubmitting, isExecuting, reviewDialog };
}
