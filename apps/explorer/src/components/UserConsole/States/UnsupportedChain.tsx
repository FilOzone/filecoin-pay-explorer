"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useSwitchChain } from "wagmi";
import { useConsoleAccountExit } from "@/components/shared/CustomConnectButton/useWalletExit";
import { supportedChains } from "@/services/wagmi/config";
import { ExitLink } from "./ExitLink";

const UnsupportedChain = () => {
  const { switchChain } = useSwitchChain();
  // A wallet that cannot add Filecoin never leaves this screen, so it needs a way out of the console.
  const walletExit = useConsoleAccountExit();

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WarningCircleIcon}
      title='Unsupported Network'
      description="The network you're connected to is not supported. Please switch to one of the supported networks to use the console."
    >
      <div className='flex flex-col gap-3 w-full max-w-xs'>
        {supportedChains.map((chain) => (
          <Button
            key={chain.id}
            variant='primary'
            onClick={() =>
              switchChain(
                { chainId: chain.id },
                {
                  onError: (error) => toast.error(`Unable to switch to ${chain.label}`, { description: error.message }),
                },
              )
            }
          >
            Switch to {chain.label}
          </Button>
        ))}
        <ExitLink action={walletExit.action} exit={walletExit.exit} />
      </div>
    </EmptyStateCard>
  );
};

export default UnsupportedChain;
