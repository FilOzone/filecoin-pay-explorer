"use client";

import { useState } from "react";
import { toast } from "sonner";
import { WALLET_EXIT_LABEL, type WalletExitAction } from "@/components/shared/CustomConnectButton/state";

export function ExitLink({ action, exit }: { action: WalletExitAction; exit: () => Promise<void> }) {
  const [isExiting, setIsExiting] = useState(false);
  const pendingLabel = action === "logout" ? "Logging out…" : "Disconnecting…";

  const handleExit = async () => {
    setIsExiting(true);
    try {
      await exit();
    } catch (error) {
      setIsExiting(false);
      toast.error(action === "logout" ? "Unable to log out" : "Unable to disconnect wallet", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <button
      className='text-sm text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50'
      type='button'
      disabled={isExiting}
      onClick={() => void handleExit()}
    >
      {isExiting ? pendingLabel : WALLET_EXIT_LABEL[action]}
    </button>
  );
}
