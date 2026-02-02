import type { Rail } from "@filecoin-pay/types";
import { createContext, type ReactNode, useContext, useMemo } from "react";

interface SettleRailContextValue {
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
  onSettle: (rail: Rail) => void;
}

export const SettleRailProvider = ({ children, onSettle }: SettleRailProviderProps) => {
  const value = useMemo(() => ({ openSettleDialog: onSettle }), [onSettle]);
  return <SettleRailContext.Provider value={value}>{children}</SettleRailContext.Provider>;
};
