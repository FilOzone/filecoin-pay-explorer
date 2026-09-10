"use client";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import type { Network } from "@/types";
import { type AuthorizeParamError, parseAuthorizeLink } from "@/utils/authorizeParam";
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
  const [prefillError, setPrefillError] = useState<AuthorizeParamError | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const link = parseAuthorizeLink(params);
    if (!link) return;
    if ("error" in link) {
      setPrefillError(link.error);
    } else {
      setPrefillAddress(link.address);
      setPrefillScopes(link.scopes);
      // The section refuses to prefill while the wallet is on a different chain.
      setPrefillNetwork(link.network);
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
      prefillError={prefillError}
    />
  );
};

export default SessionKeysPage;
