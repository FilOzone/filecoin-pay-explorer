import { Button as NewButton } from "@filecoin-foundation/ui-filecoin/Button";
import { Button } from "@filecoin-pay/ui/components/button";
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
                  <NewButton variant='primary' onClick={openConnectModal} type='button'>
                    Connect Wallet
                  </NewButton>
                );
              }
              if (chain.unsupported) {
                return (
                  <Button variant='destructive' onClick={openChainModal} type='button'>
                    Wrong network
                  </Button>
                );
              }
              return (
                <div style={{ display: "flex", gap: 12 }}>
                  <Balance />
                  <NetworkOptions chainId={chain.id} />
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
