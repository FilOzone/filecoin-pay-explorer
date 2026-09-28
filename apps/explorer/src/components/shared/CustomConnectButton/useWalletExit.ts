"use client";

import { type ConnectedWallet, useLogout, usePrivy } from "@privy-io/react-auth";
import { useDisconnect } from "wagmi";
import { exitWalletSession, getWalletExitAction } from "./state";

type ExitableWallet = Pick<ConnectedWallet, "connectorType" | "disconnect">;

export const useWalletExit = (activeWallet?: ExitableWallet) => {
  const { authenticated } = usePrivy();
  const { logout } = useLogout();
  const { mutateAsync: disconnectAsync } = useDisconnect();
  const action = getWalletExitAction(authenticated, activeWallet?.connectorType);
  const exit = () =>
    exitWalletSession({
      authenticated,
      logout,
      disconnect: activeWallet ? () => activeWallet.disconnect() : undefined,
      disconnectConnection: () => disconnectAsync(),
    });
  return { action, exit };
};
