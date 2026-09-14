"use client";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import { useConsumedSearchParams } from "@/hooks/useConsumedSearchParams";
import { type AuthorizeParamError, parseAuthorizeLink, parseRevokeLink } from "@/utils/authorizeParam";
import { getNetworkFromChainId } from "@/utils/network";

/** The error a link parser reported, if it reported one. */
function linkError<T extends object>(link: T | { error: AuthorizeParamError } | null): AuthorizeParamError | null {
  return link !== null && "error" in link ? link.error : null;
}

const SessionKeysPage = () => {
  const { address, chainId } = useConnection();
  const params = useConsumedSearchParams(["authorize", "scopes", "network", "revoke"]);
  const link = useMemo(() => (params ? parseAuthorizeLink(params) : null), [params]);
  const request = link && "address" in link ? link : null;
  // `logout` sends the owner here to revoke the key it just dropped locally.
  const revokeLink = useMemo(() => (params ? parseRevokeLink(params) : null), [params]);
  const revokeRequest = revokeLink && "address" in revokeLink ? revokeLink : null;

  return (
    <SessionKeysSection
      network={getNetworkFromChainId(chainId)}
      account={address}
      prefillAddress={request?.address}
      prefillScopes={request?.scopes}
      prefillNetwork={request?.network}
      prefillError={linkError(link) ?? linkError(revokeLink)}
      revokeAddress={revokeRequest?.address}
      revokeNetwork={revokeRequest?.network}
    />
  );
};

export default SessionKeysPage;
