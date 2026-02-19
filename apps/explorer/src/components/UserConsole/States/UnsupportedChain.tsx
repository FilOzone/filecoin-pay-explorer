import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useChainModal } from "@rainbow-me/rainbowkit";

const UnsupportedChain = () => {
  const { openChainModal } = useChainModal();

  return (
    <EmptyStateCard
      titleTag='h2'
      icon={WarningCircleIcon}
      title='Unsupported Network'
      description="The network you're connected to is not supported. Please switch to one of the supported networks to use the console."
    >
      <div className='flex flex-col gap-3 w-full max-w-xs'>
        <Button variant='primary' onClick={openChainModal}>
          Switch Network
        </Button>
      </div>
    </EmptyStateCard>
  );
};

export default UnsupportedChain;
