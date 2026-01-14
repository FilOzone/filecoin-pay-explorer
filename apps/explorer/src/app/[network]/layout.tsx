import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { supportedChains } from "@/services/wagmi/config";
import type { Network } from "@/types";
import { NetworkSyncWrapper } from "./NetworkSyncWrapper";

const VALID_NETWORKS = supportedChains.map((chain) => chain.slug) as readonly Network[];

interface NetworkLayoutProps {
  children: ReactNode;
  params: Promise<{ network: string }>;
}

export default async function NetworkLayout({ children, params }: NetworkLayoutProps) {
  const network = (await params).network as Network;

  if (!VALID_NETWORKS.includes(network)) {
    notFound();
  }

  return <NetworkSyncWrapper urlNetwork={network}>{children}</NetworkSyncWrapper>;
}
