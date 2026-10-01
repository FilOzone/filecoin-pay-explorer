"use client";

import { type ConnectedWallet, useLogout, usePrivy } from "@privy-io/react-auth";
import { useDisconnect } from "wagmi";
import { setConsoleExited } from "@/components/UserConsole/console-wallet";
import { exitWalletSession, getWalletExitAction } from "./state";

type ExitableWallet = Pick<ConnectedWallet, "connectorType" | "disconnect">;

export const useWalletExit = (activeWallet?: ExitableWallet) => {
  const { authenticated } = usePrivy();
  const { logout } = useLogout();
  const { mutateAsync: disconnectAsync } = useDisconnect();
  const action = getWalletExitAction(authenticated, activeWallet?.connectorType);
  const exit = async () => {
    setConsoleExited(true);
    try {
      await exitWalletSession({
        authenticated,
        logout,
        disconnect: activeWallet ? () => activeWallet.disconnect() : undefined,
        disconnectConnection: () => disconnectAsync(),
      });
    } catch (error) {
      setConsoleExited(false);
      throw error;
    }
  };
  return { action, exit };
};
