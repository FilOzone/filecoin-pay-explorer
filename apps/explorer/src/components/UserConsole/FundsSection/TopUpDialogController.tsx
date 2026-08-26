import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { getChain } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";
import { useTopUpActivity } from "../TopUpActivityContext";
import { GuidedTopUpDialog } from "./components";
import { withoutTopUpSearchParam } from "./data/guided-top-up";
import { getSquidAcquisitionStorageKey, hasSavedSquidAcquisition } from "./data/squid-acquisition";

interface TopUpDialogControllerProps {
  accountId: string;
  children?: (openTopUp: () => void, isOpen: boolean) => ReactNode;
  showTrigger?: boolean;
}

export function TopUpDialogController({ accountId, children, showTrigger = false }: TopUpDialogControllerProps) {
  const [open, setOpen] = useState(false);
  const [hasSavedAcquisition, setHasSavedAcquisition] = useState(false);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const didAutoOpenSavedAcquisition = useRef(false);
  const { setTopUpActive } = useTopUpActivity();
  const { address } = useConnection();
  const { synapse } = useSynapse();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetChain = getChain("mainnet");
  const { data: accountSummary, isFetching: isAccountSummaryLoading } = useQuery({
    enabled: open && !!address && synapse?.chain.id === targetChain.id,
    queryFn: synapse ? () => synapse.payments.accountSummary() : undefined,
    queryKey: ["payments", "account-summary", targetChain.id, address],
  });

  const openTopUp = useCallback(() => {
    setOpen(true);
    setTopUpActive(true);
  }, [setTopUpActive]);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      setTopUpActive(nextOpen);
      if (!nextOpen) {
        let hasSaved = false;
        try {
          hasSaved = address !== undefined && hasSavedSquidAcquisition(window.localStorage, address);
        } catch {
          // The dialog reports unavailable storage. Do not advertise recovery
          // when the controller cannot verify that a marker exists.
        }
        setHasSavedAcquisition(hasSaved);
        didAutoOpenSavedAcquisition.current = hasSaved;
      }
      if (!nextOpen && searchParams.has("topUp")) {
        router.replace(`${pathname}${withoutTopUpSearchParam(searchParams)}`);
      }
    },
    [address, pathname, router, searchParams, setTopUpActive],
  );

  useEffect(() => {
    if (searchParams.get("topUp") === "1") openTopUp();
  }, [openTopUp, searchParams]);

  useEffect(() => {
    const refreshSavedAcquisition = () => {
      let hasSaved = false;
      try {
        hasSaved = address !== undefined && hasSavedSquidAcquisition(window.localStorage, address);
      } catch {
        // The dialog owns the storage-unavailable error state.
      }
      setHasSavedAcquisition(hasSaved);
      if (!hasSaved) {
        didAutoOpenSavedAcquisition.current = false;
        return;
      }
      if (!didAutoOpenSavedAcquisition.current) {
        didAutoOpenSavedAcquisition.current = true;
        openTopUp();
      }
    };

    refreshSavedAcquisition();
    const handleStorage = (event: StorageEvent) => {
      if (
        address === undefined ||
        event.storageArea !== window.localStorage ||
        (event.key !== null && event.key !== getSquidAcquisitionStorageKey(address))
      ) {
        return;
      }
      setRecoveryRevision((revision) => revision + 1);
      refreshSavedAcquisition();
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [address, openTopUp]);

  useEffect(
    () => () => {
      setTopUpActive(false);
    },
    [setTopUpActive],
  );

  return (
    <>
      {hasSavedAcquisition && !open && (
        <div className='flex justify-center'>
          <Button aria-label='View top-up in progress' onClick={openTopUp} variant='tertiary'>
            Top-up in progress — view
          </Button>
        </div>
      )}
      {children?.(openTopUp, open)}
      {showTrigger && (
        <div className='flex justify-center'>
          <Button onClick={openTopUp} variant='primary'>
            Fund with another token
          </Button>
        </div>
      )}
      <GuidedTopUpDialog
        accountId={accountId}
        accountSummary={accountSummary}
        isAccountSummaryLoading={isAccountSummaryLoading}
        onOpenChange={handleOpenChange}
        open={open}
        recoveryRevision={recoveryRevision}
      />
    </>
  );
}
