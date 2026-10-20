"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type TopUpActivity = {
  isTopUpActive: boolean;
  setTopUpActive: (active: boolean) => void;
};

const TopUpActivityContext = createContext<TopUpActivity | null>(null);

export function TopUpActivityProvider({ children }: { children: ReactNode }) {
  const [isTopUpActive, setTopUpActive] = useState(false);
  const value = useMemo(() => ({ isTopUpActive, setTopUpActive }), [isTopUpActive]);

  return <TopUpActivityContext.Provider value={value}>{children}</TopUpActivityContext.Provider>;
}

export function useTopUpActivity(): TopUpActivity {
  const activity = useContext(TopUpActivityContext);
  if (!activity) throw new Error("useTopUpActivity must be used within TopUpActivityProvider");
  return activity;
}
