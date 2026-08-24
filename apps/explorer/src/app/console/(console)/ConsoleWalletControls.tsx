import { AlertTriangle } from "lucide-react";
import Balance from "@/components/shared/Balance";
import ChainSwitcher from "@/components/shared/ChainSwitcher";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import type { ConsoleAccessState } from "./console-access";

type ConsoleWalletControlsProps = {
  accessState: ConsoleAccessState;
  chainId: number | undefined;
  isTopUpActive: boolean;
};

export function ConsoleWalletControls({ accessState, chainId, isTopUpActive }: ConsoleWalletControlsProps) {
  switch (accessState) {
    case "not-connected":
      return null;
    case "unsupported-chain":
      return <UnsupportedNetworkBadge />;
    case "squid-source": {
      const sourceChain = SQUID_SOURCE_CHAINS.find((chain) => chain.id === chainId);
      return isTopUpActive ? (
        <span className='inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium'>
          Wallet: {sourceChain?.name ?? "Source network"}
        </span>
      ) : (
        <UnsupportedNetworkBadge />
      );
    }
    case "ready":
      return (
        <>
          <Balance />
          {chainId !== undefined ? <ChainSwitcher chainId={chainId} /> : null}
        </>
      );
  }
}

function UnsupportedNetworkBadge() {
  return (
    <span className='inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700'>
      <AlertTriangle className='size-4' />
      Unsupported Network
    </span>
  );
}
