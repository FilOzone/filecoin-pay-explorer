"use client";

import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useMemo } from "react";
import { type Account, type Chain, type Client, type PublicClient, type Transport, zeroAddress } from "viem";
import { type Config, useConnectorClient, usePublicClient } from "wagmi";

export function clientToProvider(client: Client<Transport, Chain, Account> | PublicClient<Transport, Chain>) {
  const { chain, transport } = client;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };

  return new BrowserProvider(transport, network);
}

export function clientToSigner(client: Client<Transport, Chain, Account> | PublicClient<Transport, Chain>) {
  const { account } = client;
  const provider = clientToProvider(client);

  // in some cases we need a signer from a public client (which could not necessarily have an account.address linked). That is why we use zeroAddress as a fallback
  const signer = new JsonRpcSigner(provider, account ? account.address : zeroAddress);
  return signer;
}

/** Hook to convert a viem Wallet Client to an ethers.js Signer. */
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  const { data: connectorClient } = useConnectorClient<Config>({ chainId });
  const publicClient = usePublicClient();

  const connectorSigner = useMemo(() => {
    if (!connectorClient) return undefined;
    return clientToSigner(connectorClient);
  }, [connectorClient]);

  const publicSigner = useMemo(() => {
    if (!publicClient) return undefined;
    return clientToSigner(publicClient);
  }, [publicClient]);

  // in case no wallet is connected, we return a public signer with the zero address
  return useMemo(() => connectorSigner ?? publicSigner, [connectorSigner, publicSigner]);
}

export function useEthersProvider({ chainId }: { chainId?: number } = {}) {
  const { data: connectorClient } = useConnectorClient<Config>({ chainId });
  const publicClient = usePublicClient();

  const connectorProvider = useMemo(() => {
    if (!connectorClient) return undefined;
    return clientToProvider(connectorClient);
  }, [connectorClient]);

  const publicProvider = useMemo(() => {
    if (!publicClient) return undefined;
    return clientToProvider(publicClient);
  }, [publicClient]);

  // in case no wallet is connected, we return a public provider
  return useMemo(() => connectorProvider ?? publicProvider, [connectorProvider, publicProvider]);
}
