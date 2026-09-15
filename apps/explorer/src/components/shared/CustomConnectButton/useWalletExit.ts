"use client";

import { type ConnectedWallet, useLogout, usePrivy } from "@privy-io/react-auth";
import { consoleWalletSelector } from "@/components/UserConsole/console-wallet";
import { exitWalletSession, getWalletExitAction } from "./state";

type ExitableWallet = Pick<ConnectedWallet, "connectorType" | "disconnect">;

export const useWalletExit = (activeWallet?: ExitableWallet) => {
  const { authenticated } = usePrivy();
  const { logout } = useLogout();
  const action = getWalletExitAction(authenticated, activeWallet?.connectorType);
  const exit = () =>
    exitWalletSession({
      authenticated,
      logout,
      disconnect: activeWallet ? () => activeWallet.disconnect() : undefined,
      pauseSelection: consoleWalletSelector.pause,
      resumeSelection: consoleWalletSelector.resume,
    });
  return { action, exit };
};
