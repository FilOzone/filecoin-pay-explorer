"use client";
import { useConnection } from "wagmi";
import SessionKeysSection from "@/components/UserConsole/SessionKeysSection";
import { getNetworkFromChainId } from "@/utils/network";

// The (console) layout gates on connection + supported chain, so by the time
// this renders the wallet address is present; the null return is a type guard.
const SessionKeysPage = () => {
  const { address, chainId } = useConnection();

  if (!address) {
    return null;
  }

  return <SessionKeysSection network={getNetworkFromChainId(chainId)} account={address} />;
};

export default SessionKeysPage;
