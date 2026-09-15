"use client";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import { useConsumedSearchParams } from "@/hooks/useConsumedSearchParams";
import { parseAuthorizeLink } from "@/utils/authorizeParam";
import { getNetworkFromChainId } from "@/utils/network";

const SessionKeysPage = () => {
  const { address, chainId } = useConnection();
  const params = useConsumedSearchParams(["authorize", "scopes", "network"]);
  const link = useMemo(() => (params ? parseAuthorizeLink(params) : null), [params]);
  const request = link && "address" in link ? link : null;

  return (
    <SessionKeysSection
      network={getNetworkFromChainId(chainId)}
      account={address}
      prefillAddress={request?.address}
      prefillScopes={request?.scopes}
      prefillNetwork={request?.network}
      prefillError={link && "error" in link ? link.error : null}
    />
  );
};

export default SessionKeysPage;
