import { useState } from "react";
import { toast } from "sonner";
import { erc20Abi, type Hex, isAddress, zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import {
  type CustomTokenStatus,
  getCustomTokenStatus,
  type PickerToken,
  type TokenPickerMode,
} from "@/components/UserConsole/DepositTokenPicker";
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

/** Sentinel value for the "Custom service address…" entry in the service select. */
export const CUSTOM_SERVICE_OPTION = "custom";

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
    serviceChoice !== CUSTOM_SERVICE_OPTION ? services.find((s) => s.address === serviceChoice) : undefined;
  const operatorAddress: `0x${string}` | undefined = (() => {
    if (selectedService) return selectedService.address as `0x${string}`;
    const trimmed = customServiceInput.trim();
    if (serviceChoice === CUSTOM_SERVICE_OPTION && isAddress(trimmed)) return trimmed;
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
  knownTokens: PickerToken[];
  pickerMode: TokenPickerMode;
  customAddress: string;
  token: PickerToken | null;
  /** Curated tokens are permit-verified; custom tokens must pass the nonces() probe. */
  supportsPermit: boolean;
  customTokenStatus: CustomTokenStatus;
  balance: bigint | undefined;
  isLoadingBalance: boolean;
  chainName: string;
  selectToken: (token: PickerToken) => void;
  changeMode: (mode: TokenPickerMode) => void;
  changeCustomAddress: (value: string) => void;
  reset: () => void;
}

export function useTokenSelection(open: boolean): TokenSelection {
  const { constants } = useSynapse();
  const { address: userAddress } = useAccount();

  const knownTokens: PickerToken[] = paymentTokensByChainId[constants.chain.id] ?? [];
  // No token is preselected, so the picker opens on the list.
  const [pickerMode, setPickerMode] = useState<TokenPickerMode>("list");
  const [selectedKnown, setSelectedKnown] = useState<PickerToken | null>(null);
  const [customAddress, setCustomAddress] = useState("");

  const trimmedCustomAddress = customAddress.trim();
  const isCustomAddressValid = isAddress(trimmedCustomAddress);
  const customTokenAddress: Hex | null = !selectedKnown && isCustomAddressValid ? (trimmedCustomAddress as Hex) : null;

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
  const chainToken: PickerToken | null =
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

  const customTokenStatus = getCustomTokenStatus({
    address: trimmedCustomAddress,
    isValidAddress: isCustomAddressValid,
    isLoadingReads: isLoadingTokenReads,
    isReadsError: isTokenReadsError,
    token: chainToken,
  });

  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: (token?.address as Hex | undefined) ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!token && !!userAddress && open },
  });

  const selectToken = (picked: PickerToken) => {
    setSelectedKnown(picked);
    setCustomAddress("");
    setPickerMode("collapsed");
  };

  const changeMode = (mode: TokenPickerMode) => {
    if (mode === "custom") setSelectedKnown(null);
    setPickerMode(mode);
  };

  const reset = () => {
    setPickerMode("list");
    setSelectedKnown(null);
    setCustomAddress("");
  };

  return {
    knownTokens,
    pickerMode,
    customAddress,
    token,
    supportsPermit,
    customTokenStatus,
    balance,
    isLoadingBalance,
    chainName: constants.chain.name,
    selectToken,
    changeMode,
    changeCustomAddress: setCustomAddress,
    reset,
  };
}

export interface SubmitArgs {
  operatorAddress: `0x${string}`;
  token: PickerToken;
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
    setIsSubmitting(true);
    try {
      if (parsedDeposit !== null && parsedDeposit > 0n) {
        if (!walletClient || !publicClient || !userAddress) return;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
        // execute() toasts its own failures; the permit signature is the one
        // step before it that can throw (signature declined, or a custom token
        // without EIP-2612 support), so surface that here.
        let permitSignature: PermitSignature;
        try {
          permitSignature = await getPermitSignature(
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
