import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { DataSet } from "@filecoin-pay/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { fwss } from "@filoz/synapse-core/abis";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { useMutation, useMutationState } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { useConnection } from "wagmi";
import InlineTextLoader from "@/components/shared/InlineTextLoader";
import { Notice } from "@/components/shared/Notice";
import { getChain } from "@/constants/chains";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { Network } from "@/types";

const TRIGGER_LABEL = {
  idle: "Terminate",
  error: "Terminate",
  pending: "Terminating…",
  success: "Terminated",
} as const;

interface TerminateDataSetProps {
  dataSetId: DataSet["dataSetId"];
  network: Network;
  className?: string;
}

/** Terminate button and confirmation for one Warm Storage data set. */
export function TerminateDataSet({ dataSetId: id, network, className }: TerminateDataSetProps) {
  const { address } = useConnection();
  const [isOpen, setIsOpen] = useState(false);
  const chain = getChain(network);
  const dataSetId = id.toString();
  const mutationKey = ["terminateDataSet", network, dataSetId];

  const { execute } = useContractTransaction({
    account: address,
    contractAddress: chain.contracts.fwss.address,
    // The SDK's bundled FWSS ABI predates the two-argument terminateService.
    abi: fwss,
    chainId: chain.id,
    explorerUrl: chain.blockExplorers?.default.url,
  });

  const { mutate: terminate } = useMutation({
    mutationKey,
    // A termination can't be undone, so remember it for as long as the subgraph takes to index it.
    gcTime: Number.POSITIVE_INFINITY,
    // Settles on the receipt, since `execute` resolves at submission.
    mutationFn: () =>
      new Promise<void>((resolve, reject) => {
        // Empty extraData lets the payer send it, winding payment down over the lockup period;
        // a payer signature instead is accepted only from the provider.
        execute({
          functionName: "terminateService",
          args: [BigInt(dataSetId), "0x"],
          metadata: { type: "terminateDataSet", dataSetId },
          onConfirmed: () => resolve(),
          onReverted: reject,
        }).catch(reject);
      }),
  });

  // Read from the cache: the table and the stale queue both list a data set, and either can unmount its row mid-flight.
  const status =
    useMutationState({ filters: { mutationKey }, select: (mutation) => mutation.state.status }).at(-1) ?? "idle";
  const canTerminate = status === "idle" || status === "error";

  return (
    <>
      <Button
        variant='ghost'
        disabled={!canTerminate}
        onClick={() => setIsOpen(true)}
        className={clsx("text-destructive", className)}
      >
        {TRIGGER_LABEL[status]}
      </Button>

      {/* Closable at any time: a submitted termination completes on chain and its toast reports it. */}
      <Dialog open={isOpen && status !== "success"} onOpenChange={setIsOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>Terminate data set #{dataSetId}?</DialogTitle>
            <DialogDescription>Stops paying Warm Storage for this data set.</DialogDescription>
          </DialogHeader>

          <Notice tone='warn'>
            <b>This cannot be undone.</b> Payment continues for up to {TIME_CONSTANTS.DEFAULT_LOCKUP_DAYS.toString()}{" "}
            days, paid from the funds already locked for this data set, and then stops. After that the provider can
            delete the data, and it cannot be recovered.
          </Notice>

          <DialogFooter>
            <button
              type='button'
              disabled={!canTerminate}
              onClick={() => terminate()}
              className='rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5'
            >
              {status === "pending" ? <InlineTextLoader text='Terminating…' /> : "Terminate data set"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
