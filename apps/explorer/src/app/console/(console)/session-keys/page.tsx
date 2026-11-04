"use client";
import { useEffect, useMemo } from "react";
import { useConnection } from "wagmi";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import { useConsoleNetwork } from "@/components/UserConsole/useConsoleNetwork";
import { dropSearchParams, useLinkSearchParams } from "@/hooks/useLinkSearchParams";
import { LINK_PARAMS, parseRevokeLink } from "@/utils/authorizeParam";

const SessionKeysPage = () => {
  const { address } = useConnection();
  const { network } = useConsoleNetwork();
  // The revoke link stays in the URL: a network or account switch can remount this page, and the
  // link must survive it. The section drops it once it has acted on the link.
  // Authorize links are redirected to /console/setup before they get here.
  const params = useLinkSearchParams(["revoke"]);
  const revokeLink = useMemo(() => (params ? parseRevokeLink(params) : null), [params]);
  const revokeRequest = revokeLink && "address" in revokeLink ? revokeLink : null;
  const revokeError = revokeLink && "error" in revokeLink ? revokeLink.error : null;
  // A link nothing can act on would otherwise sit in the URL and report again on every reload.
  useEffect(() => {
    if (revokeError) dropSearchParams(LINK_PARAMS);
  }, [revokeError]);

  return (
    <SessionKeysSection
      network={network}
      account={address}
      revokeError={revokeError}
      revokeAddress={revokeRequest?.address}
      revokeNetwork={revokeRequest?.network}
    />
  );
};

export default SessionKeysPage;
