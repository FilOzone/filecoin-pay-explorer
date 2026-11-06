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
import { useState } from "react";
import { useConnection } from "wagmi";
import InlineTextLoader from "@/components/shared/InlineTextLoader";
import { Notice } from "@/components/shared/Notice";
import { getChain } from "@/constants/chains";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { Network } from "@/types";

const TRIGGER_LABEL = { idle: "Terminate", pending: "Terminating…", confirmed: "Terminated" } as const;

interface TerminateDataSetProps {
  dataSetId: DataSet["dataSetId"];
  network: Network;
}

/** Terminate button and confirmation for one Warm Storage dataset; stays mounted with its row until the receipt lands. */
export function TerminateDataSet({ dataSetId: id, network }: TerminateDataSetProps) {
  const { address } = useConnection();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<keyof typeof TRIGGER_LABEL>("idle");
  const chain = getChain(network);
  const dataSetId = id.toString();

  const { execute } = useContractTransaction({
    account: address,
    contractAddress: chain.contracts.fwss.address,
    // The SDK's bundled FWSS ABI predates the two-argument terminateService.
    abi: fwss,
    chainId: chain.id,
    explorerUrl: chain.blockExplorers?.default.url,
  });

  const handleTerminate = async () => {
    if (phase !== "idle") return;
    setPhase("pending");
    try {
      // Empty extraData lets the payer send it, winding payment down over the lockup period;
      // a payer signature instead is accepted only from the provider.
      await execute({
        functionName: "terminateService",
        args: [BigInt(dataSetId), "0x"],
        metadata: { type: "terminateDataSet", dataSetId },
        onConfirmed: () => {
          setPhase("confirmed");
          setIsOpen(false);
        },
        onReverted: () => setPhase("idle"),
      });
    } catch {
      // Wallet rejected or submission failed: nothing on chain, and the hook already showed a toast.
      setPhase("idle");
    }
  };

  return (
    <>
      <Button variant='ghost' disabled={phase !== "idle"} onClick={() => setIsOpen(true)} className='text-destructive'>
        {TRIGGER_LABEL[phase]}
      </Button>

      {/* Closable at any time: a submitted termination completes on chain and its toast reports it. */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
              disabled={phase !== "idle"}
              onClick={handleTerminate}
              className='rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5'
            >
              {phase === "pending" ? <InlineTextLoader text='Terminating…' /> : "Terminate data set"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
