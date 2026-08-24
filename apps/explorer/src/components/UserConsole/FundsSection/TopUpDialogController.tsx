import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { getChain } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";
import { useTopUpActivity } from "../TopUpActivityContext";
import { GuidedTopUpDialog } from "./components";
import { withoutTopUpSearchParam } from "./data/guided-top-up";

interface TopUpDialogControllerProps {
  accountId: string;
  children?: (openTopUp: () => void, isOpen: boolean) => ReactNode;
  showTrigger?: boolean;
}

export function TopUpDialogController({ accountId, children, showTrigger = false }: TopUpDialogControllerProps) {
  const [open, setOpen] = useState(false);
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
      if (!nextOpen && searchParams.has("topUp")) {
        router.replace(`${pathname}${withoutTopUpSearchParam(searchParams)}`);
      }
    },
    [pathname, router, searchParams, setTopUpActive],
  );

  useEffect(() => {
    if (searchParams.get("topUp") === "1") openTopUp();
  }, [openTopUp, searchParams]);

  useEffect(
    () => () => {
      setTopUpActive(false);
    },
    [setTopUpActive],
  );

  return (
    <>
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
      />
    </>
  );
}
