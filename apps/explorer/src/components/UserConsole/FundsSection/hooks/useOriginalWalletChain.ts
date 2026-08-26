import { useEffect, useRef } from "react";

export function useOriginalWalletChain(open: boolean, chainId?: number) {
  const originalChainId = useRef<number | undefined>(undefined);
  const awaitingHydration = useRef(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      originalChainId.current = chainId;
      awaitingHydration.current = chainId === undefined;
    }
    if (open && awaitingHydration.current && chainId !== undefined) {
      originalChainId.current = chainId;
      awaitingHydration.current = false;
    }
    if (!open) awaitingHydration.current = false;
    wasOpen.current = open;
  }, [chainId, open]);

  return () => {
    const captured = originalChainId.current;
    originalChainId.current = undefined;
    awaitingHydration.current = false;
    return captured;
  };
}
