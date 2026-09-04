"use client";
import { useParams } from "next/navigation";
import { isAddress } from "viem";
import { useConnection } from "wagmi";
import { ServiceDetail } from "@/components/UserConsole/ServiceDetail";
import { ServiceNotFoundState } from "@/components/UserConsole/ServiceDetail/components";
import { getNetworkFromChainId } from "@/utils/network";

/**
 * The (console) layout gates on a connected wallet, so `address` is set by the
 * time this renders. A segment that is not an address never reaches the
 * subgraph — the console's own not-found state stands in for `notFound()`,
 * which would drop the reader out of the console shell.
 */
const ServicePage = () => {
  const { operator } = useParams<{ operator: string }>();
  const { address, chainId } = useConnection();

  if (!isAddress(operator)) {
    return <ServiceNotFoundState />;
  }

  if (!address) {
    return null;
  }

  return <ServiceDetail network={getNetworkFromChainId(chainId)} operatorAddress={operator} userAddress={address} />;
};

export default ServicePage;
