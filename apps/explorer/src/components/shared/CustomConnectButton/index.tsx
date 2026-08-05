import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const CustomConnectButton = () => {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        if (connected) return null;
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
            <Button variant='primary' onClick={openConnectModal} type='button' size='compact'>
              Connect Wallet
            </Button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

export default CustomConnectButton;
