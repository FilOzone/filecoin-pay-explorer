import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import { useGraphQLClient } from "@/hooks/useGraphQLQuery";
import { useIndexedTransaction } from "@/hooks/useIndexedTransaction";
import useSynapse from "@/hooks/useSynapse";
import { getPermitSignature, type PermitSignature } from "@/utils/permit";
import {
  ADD_SERVICE_STORAGE_NAMESPACE,
  type AddServiceContext,
  buildIsAddServiceIndexed,
  decodeAddServiceContext,
  encodeAddServiceContext,
  invalidateAddServiceQueries,
} from "../data/lifecycle";
import type { PaymentTokenDetails } from "./useTokenSelection";

// Default service lockup: 30 days in Filecoin epochs (2,880 per day).
const DEFAULT_MAX_LOCKUP_PERIOD = 86_400n;
const PERMIT_DEADLINE_SECONDS = 3600;

export interface SubmitArgs {
  operatorAddress: `0x${string}`;
  token: PaymentTokenDetails;
  /** Parsed deposit amount; null or 0n approves without depositing. */
  parsedDeposit: bigint | null;
  lockupInWei: bigint;
  rateInWei: bigint;
}

/** Submits Add Service and tracks it through confirmation and indexing. */
export function useAddServiceLifecycle() {
  const { constants } = useSynapse();
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: constants.chain.id });
  const queryClient = useQueryClient();
  const { executeQuery } = useGraphQLClient({ networkOverride: constants.chain.slug });

  const { execute } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    chainId: constants.chain.id,
    explorerUrl: constants.chain.blockExplorers?.default.url,
  });

  // Keep the latest wallet identity available after the signature wait.
  const liveWalletRef = useRef({ address: userAddress, chainId: constants.chain.id });
  useEffect(() => {
    liveWalletRef.current = { address: userAddress, chainId: constants.chain.id };
  }, [userAddress, constants.chain.id]);

  const isIndexed = useCallback(
    (context: AddServiceContext, confirmedBlockNumber: bigint) => {
      if (!userAddress) return Promise.resolve(false);
      return buildIsAddServiceIndexed(executeQuery, userAddress)(context, confirmedBlockNumber);
    },
    [executeQuery, userAddress],
  );

  const onIndexed = useCallback(async () => {
    if (!userAddress) return;
    await invalidateAddServiceQueries(queryClient, userAddress);
  }, [queryClient, userAddress]);

  const lifecycle = useIndexedTransaction<AddServiceContext>({
    namespace: ADD_SERVICE_STORAGE_NAMESPACE,
    owner: userAddress,
    chainId: constants.chain.id,
    encodeContext: encodeAddServiceContext,
    decodeContext: decodeAddServiceContext,
    isIndexed,
    onIndexed,
  });

  const submit = useCallback(
    async ({ operatorAddress, token, parsedDeposit, lockupInWei, rateInWei }: SubmitArgs) => {
      const tokenAddress = token.address as `0x${string}`;
      const isDepositing = parsedDeposit !== null && parsedDeposit > 0n;

      const context: AddServiceContext = {
        operatorAddress,
        tokenAddress,
        tokenSymbol: token.symbol,
        tokenDecimals: token.decimals,
        depositAmountWei: (isDepositing ? parsedDeposit : 0n).toString(),
        functionName: isDepositing ? "depositWithPermitAndApproveOperator" : "setOperatorApproval",
      };

      await lifecycle.submit(context, async () => {
        if (!isDepositing) {
          return execute({
            functionName: "setOperatorApproval",
            args: [tokenAddress, operatorAddress, true, rateInWei, lockupInWei, DEFAULT_MAX_LOCKUP_PERIOD],
            metadata: { type: "approveOperator", operator: operatorAddress, token: token.symbol },
          });
        }

        if (!walletClient || !publicClient || !userAddress) {
          const message = "Reconnect your wallet and try again.";
          toast.error("Wallet not connected", { description: message });
          throw new Error(message);
        }

        const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS);
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
          const message = "The signature was declined, or this token does not support gasless approval (EIP-2612).";
          toast.error("Deposit authorization failed", { description: message });
          throw err instanceof Error ? err : new Error(message);
        }

        // Do not broadcast if the wallet changed while signing the permit.
        const live = liveWalletRef.current;
        if (live.address?.toLowerCase() !== userAddress.toLowerCase() || live.chainId !== constants.chain.id) {
          const message = "Your wallet account or network changed before this could be sent. Review and try again.";
          toast.error("Wallet changed", { description: message });
          throw new Error(message);
        }

        return execute({
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
            amount: formatUnits(parsedDeposit, token.decimals),
            token: token.symbol,
            operator: operatorAddress,
          },
        });
      });
    },
    [
      execute,
      lifecycle.submit,
      walletClient,
      publicClient,
      userAddress,
      constants.contracts.payments.address,
      constants.chain.id,
    ],
  );

  return { ...lifecycle, submit };
}
