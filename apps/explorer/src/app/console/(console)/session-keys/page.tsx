"use client";
import { useConnection } from "wagmi";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import { getNetworkFromChainId } from "@/utils/network";

const SessionKeysPage = () => {
  const { address, chainId } = useConnection();
  return <SessionKeysSection network={getNetworkFromChainId(chainId)} account={address} />;
};

export default SessionKeysPage;
