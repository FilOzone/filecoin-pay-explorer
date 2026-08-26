import { type Address, erc20Abi, type PublicClient } from "viem";

export function readUsdfcBalance(client: Pick<PublicClient, "readContract">, token: Address, owner: Address) {
  return client.readContract({
    abi: erc20Abi,
    address: token,
    args: [owner],
    functionName: "balanceOf",
  });
}
