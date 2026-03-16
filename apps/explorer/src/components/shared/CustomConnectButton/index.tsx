import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Balance, NetworkOptions } from "./components";

const CustomConnectButton = () => {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button variant='primary' onClick={openConnectModal} type='button' size='compact'>
                    Connect Wallet
                  </Button>
                );
              }
              if (chain.unsupported) {
                return (
                  <Button variant='primary' onClick={openChainModal} type='button' size='compact'>
                    Wrong Network
                  </Button>
                );
              }
              return (
                <div className='flex items-stretch gap-4'>
                  <div className='min-w-40 flex-1'>
                    <Balance />
                  </div>
                  <div className='w-40'>
                    <NetworkOptions chainId={chain.id} />
                  </div>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

export default CustomConnectButton;
