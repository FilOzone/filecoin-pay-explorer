"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import useNetwork from "@/hooks/useNetwork";
import type { Network } from "@/types";

interface NetworkSyncWrapperProps {
  urlNetwork: Network;
  children: ReactNode;
}

// URL <-> context reconciliation for explorer routes. A fresh load or deep link
// adopts the URL's network. After an explicit selection (header selector,
// console switcher, wallet sync) the selection wins: a stale URL — typically
// reached via the browser back button after switching networks in the console —
// is rewritten instead of clobbering the selection.
export function NetworkSyncWrapper({ urlNetwork, children }: NetworkSyncWrapperProps) {
  const { network, adoptNetwork, hasUserSelection } = useNetwork();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (network === urlNetwork) return;
    if (hasUserSelection) {
      router.replace(pathname.replace(`/${urlNetwork}`, `/${network}`));
    } else {
      adoptNetwork(urlNetwork);
    }
  }, [urlNetwork, network, adoptNetwork, hasUserSelection, pathname, router]);

  return <>{children}</>;
}
