import type { Hex, PublicClient, WalletClient } from "viem";
import { recoverTypedDataAddress } from "viem";

export interface PermitParams {
  tokenAddress: Hex;
  ownerAddress: Hex;
  spenderAddress: Hex;
  amount: bigint;
  deadline: bigint;
  chainId: number;
  tokenName?: string;
}

export interface PermitSignature {
  v: number;
  r: Hex;
  s: Hex;
  deadline: bigint;
}

export async function getPermitNonce(
  tokenAddress: Hex,
  ownerAddress: Hex,
  publicClient: PublicClient,
): Promise<bigint> {
  try {
    const nonce = await publicClient.readContract({
      address: tokenAddress,
      abi: [
        {
          name: "nonces",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "owner", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ],
      functionName: "nonces",
      args: [ownerAddress],
    });
    return nonce as bigint;
  } catch (error) {
    console.error("Error getting permit nonce:", error);
    throw new Error("Failed to get permit nonce. Token may not support EIP-2612 permit.");
  }
}

export async function getTokenName(tokenAddress: Hex, publicClient: PublicClient): Promise<string> {
  try {
    const name = await publicClient.readContract({
      address: tokenAddress,
      abi: [
        {
          name: "name",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ name: "", type: "string" }],
        },
      ],
      functionName: "name",
    });
    return name as string;
  } catch (error) {
    console.error("Error getting token name:", error);
    throw new Error("Failed to get token name");
  }
}

export async function getPermitSignature(
  params: PermitParams,
  walletClient: WalletClient,
  publicClient: PublicClient,
): Promise<PermitSignature> {
  const { tokenAddress, tokenName, ownerAddress, spenderAddress, amount, deadline, chainId } = params;

  const [tokenNameFetched, nonce] = await Promise.all([
    tokenName ?? getTokenName(tokenAddress, publicClient),
    getPermitNonce(tokenAddress, ownerAddress, publicClient),
  ]);

  const domain = {
    name: tokenNameFetched,
    version: "1",
    chainId: chainId,
    verifyingContract: tokenAddress,
  } as const;

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  } as const;

  const message = {
    owner: ownerAddress,
    spender: spenderAddress,
    value: amount,
    nonce: nonce,
    deadline: deadline,
  } as const;

  // Sign, then verify the signature actually recovers to the owner before
  // anything goes on-chain. Privy embedded wallets on a not-yet-trusted
  // device can sign with incomplete key state: the signature is well-formed
  // but recovers to the wrong address, and the contract rejects it with
  // "EIP2612: invalid signature" only after gas estimation. One retry
  // usually succeeds (the wallet settles after its device prompt); if not,
  // fail here with an explanation instead of a contract revert.
  let signature: Hex | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const candidate = await walletClient.signTypedData({
      account: ownerAddress,
      domain,
      types,
      primaryType: "Permit",
      message,
    });
    const recovered = await recoverTypedDataAddress({
      domain,
      types,
      primaryType: "Permit",
      message,
      signature: candidate,
    });
    if (recovered.toLowerCase() === ownerAddress.toLowerCase()) {
      signature = candidate;
      break;
    }
    console.warn(`Permit signature recovered to ${recovered}, expected ${ownerAddress} (attempt ${attempt + 1})`);
  }
  if (!signature) {
    throw new Error(
      "Your wallet produced an invalid signature. If you just logged in on this device, complete any wallet verification prompt (e.g. \u201cTrust this device\u201d) and try again.",
    );
  }

  // Split signature into v, r, s components
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const v = parseInt(signature.slice(130, 132), 16);

  return {
    v,
    r,
    s,
    deadline,
  };
}
