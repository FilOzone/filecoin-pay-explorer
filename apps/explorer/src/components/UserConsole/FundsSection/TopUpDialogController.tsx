import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { getChain } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";
import { GuidedTopUpDialog } from "./components";
import { withoutTopUpSearchParam } from "./data/guided-top-up";
import { loadSquidAcquisition } from "./data/squid-acquisition";

interface TopUpDialogControllerProps {
  accountId: string;
  children?: (openTopUp: () => void, topUpInProgress: boolean) => ReactNode;
  onOpenStateChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function TopUpDialogController({
  accountId,
  children,
  onOpenStateChange,
  showTrigger = false,
}: TopUpDialogControllerProps) {
  const [open, setOpen] = useState(false);
  const { address } = useConnection();
  const { synapse } = useSynapse();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetChain = getChain("mainnet");
  const { data: accountSummary, isFetching: isAccountSummaryLoading } = useQuery({
    enabled: open && !!address && synapse?.chain.id === targetChain.id,
    // `enabled` gates execution; react-query still requires queryFn to exist
    // on every render or it logs "No queryFn was passed" for the key.
    queryFn: () => {
      if (!synapse) throw new Error("Synapse is not ready");
      return synapse.payments.accountSummary();
    },
    queryKey: ["payments", "account-summary", targetChain.id, address],
  });

  const openTopUp = useCallback(() => {
    setOpen(true);
    onOpenStateChange?.(true);
  }, [onOpenStateChange]);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      onOpenStateChange?.(nextOpen);
      if (!nextOpen && searchParams.has("topUp")) {
        router.replace(`${pathname}${withoutTopUpSearchParam(searchParams)}`);
      }
    },
    [onOpenStateChange, pathname, router, searchParams],
  );

  useEffect(() => {
    if (searchParams.get("topUp") === "1") openTopUp();
  }, [openTopUp, searchParams]);

  // While the dialog is closed, surface any live acquisition (bridging or
  // depositing continues in the background) so the flow stays reachable.
  const [hasLiveAcquisition, setHasLiveAcquisition] = useState(false);
  useEffect(() => {
    if (open || !address) {
      setHasLiveAcquisition(false);
      return;
    }
    const check = () => {
      try {
        setHasLiveAcquisition(loadSquidAcquisition(window.localStorage, address) !== null);
      } catch {
        setHasLiveAcquisition(false);
      }
    };
    check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, [open, address]);

  return (
    <>
      {children?.(openTopUp, hasLiveAcquisition)}
      {!open && hasLiveAcquisition && !children ? (
        <div className='flex justify-center'>
          <Button onClick={openTopUp} variant='primary'>
            <span className='inline-flex items-center gap-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              Top-up in progress — view
            </span>
          </Button>
        </div>
      ) : showTrigger ? (
        <div className='flex justify-center'>
          <Button onClick={openTopUp} variant='primary'>
            Fund with another token
          </Button>
        </div>
      ) : null}
      <GuidedTopUpDialog
        accountId={accountId}
        accountSummary={accountSummary}
        isAccountSummaryLoading={isAccountSummaryLoading}
        onOpenChange={handleOpenChange}
        open={open}
      />
    </>
  );
}
