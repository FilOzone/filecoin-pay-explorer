import type { Rail } from "@filecoin-pay/types";
import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import { useBlockNumber } from "wagmi";
import type { supportedChains } from "@/services/wagmi/config";

interface SettleRailContextValue {
  currentEpoch: bigint | undefined;
  openSettleDialog: (rail: Rail) => void;
}

const SettleRailContext = createContext<SettleRailContextValue | null>(null);

export const useSettleRail = () => {
  const context = useContext(SettleRailContext);
  if (!context) {
    throw new Error("useSettleRail must be used within SettleRailProvider");
  }
  return context;
};

interface SettleRailProviderProps {
  children: ReactNode;
  chainId: (typeof supportedChains)[number]["id"];
  onSettle: (rail: Rail, currentEpoch: bigint | undefined) => void;
}

export const SettleRailProvider = ({ children, chainId, onSettle }: SettleRailProviderProps) => {
  const { data: currentEpoch } = useBlockNumber({ chainId, watch: true });
  const openSettleDialog = useCallback((rail: Rail) => onSettle(rail, currentEpoch), [currentEpoch, onSettle]);
  const value = useMemo(() => ({ currentEpoch, openSettleDialog }), [currentEpoch, openSettleDialog]);

  return <SettleRailContext.Provider value={value}>{children}</SettleRailContext.Provider>;
};
