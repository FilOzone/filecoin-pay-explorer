"use client";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import type { Network } from "@/types";
import { parseAuthorizeParam, parseNetworkParam, parseScopesParam } from "@/utils/authorizeParam";
import { getNetworkFromChainId } from "@/utils/network";
import type { ScopeId } from "@/utils/sessionKeys";

const SessionKeysPage = () => {
  const { address, chainId } = useConnection();

  // The layout keeps this page unmounted until the wallet is
  // connected, so capture the params ONCE on mount, then strip them from the
  // URL — the address bar shouldn't keep replaying an old authorization
  // request across refreshes and shares.
  const [prefillAddress, setPrefillAddress] = useState<`0x${string}` | null>(null);
  const [prefillScopes, setPrefillScopes] = useState<ScopeId[] | null>(null);
  const [prefillNetwork, setPrefillNetwork] = useState<Network | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("authorize") && !params.has("scopes")) return;
    const requested = parseAuthorizeParam(params.get("authorize"));
    setPrefillAddress(requested);
    // Scopes only mean something as part of a valid authorization request.
    if (requested) {
      setPrefillScopes(parseScopesParam(params.get("scopes")));
      // the section refuses to prefill while the wallet is connected to a different chain.
      setPrefillNetwork(parseNetworkParam(params.get("network")));
    }
    params.delete("authorize");
    params.delete("scopes");
    params.delete("network");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  return (
    <SessionKeysSection
      network={getNetworkFromChainId(chainId)}
      account={address}
      prefillAddress={prefillAddress}
      prefillScopes={prefillScopes}
      prefillNetwork={prefillNetwork}
    />
  );
};

export default SessionKeysPage;
