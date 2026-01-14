"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import useNetwork from "@/hooks/useNetwork";
import type { Network } from "@/types";

interface NetworkSyncWrapperProps {
  urlNetwork: Network;
  children: ReactNode;
}

export function NetworkSyncWrapper({ urlNetwork, children }: NetworkSyncWrapperProps) {
  const { network, setNetwork } = useNetwork();

  useEffect(() => {
    if (network !== urlNetwork) {
      setNetwork(urlNetwork);
    }
  }, [urlNetwork, network, setNetwork]);

  return <>{children}</>;
}
