import { fallback, http } from "viem";
import { base } from "viem/chains";
import { createConfig } from "wagmi";
import { calibration, mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";

export const supportedChains = [mainnet, calibration] as const;
const walletChains = [calibration, ...SQUID_SOURCE_CHAINS] as const;

// Base's default endpoint (mainnet.base.org) rate-limits aggressively and has
// aborted guided top-ups mid-flow with "over rate limit" between the approve
// and swap legs. Keep it first so behavior is unchanged when it is healthy,
// but fail over to more generous public endpoints instead of surfacing the
// error to the user.
const baseTransport = fallback([http(), http("https://base-rpc.publicnode.com"), http("https://base.drpc.org")]);

export const config = createConfig({
  chains: walletChains,
  ssr: true,
  transports: Object.fromEntries(
    walletChains.map((chain) => [chain.id, chain.id === base.id ? baseTransport : http()]),
  ),
});
