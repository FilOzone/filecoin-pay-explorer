"use client";
import { useEffect, useMemo } from "react";
import { useConnection } from "wagmi";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import { dropSearchParams, useConsumedSearchParams } from "@/hooks/useConsumedSearchParams";
import { type AuthorizeParamError, LINK_PARAMS, parseAuthorizeLink, parseRevokeLink } from "@/utils/authorizeParam";
import { getNetworkFromChainId } from "@/utils/network";

function linkError<T extends object>(link: T | { error: AuthorizeParamError } | null): AuthorizeParamError | null {
  return link !== null && "error" in link ? link.error : null;
}

const SessionKeysPage = () => {
  const { address, chainId } = useConnection();
  // `revoke` stays in the URL until acted on: a network switch can remount this page.
  const params = useConsumedSearchParams(["authorize", "scopes", "network"], ["revoke"]);
  const link = useMemo(() => (params ? parseAuthorizeLink(params) : null), [params]);
  const request = link && "address" in link ? link : null;
  const revokeLink = useMemo(() => (params ? parseRevokeLink(params) : null), [params]);
  const revokeRequest = revokeLink && "address" in revokeLink ? revokeLink : null;
  // A revoke link nothing can act on would otherwise sit in the URL and report again on every reload.
  useEffect(() => {
    if (linkError(revokeLink)) dropSearchParams(LINK_PARAMS);
  }, [revokeLink]);

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
