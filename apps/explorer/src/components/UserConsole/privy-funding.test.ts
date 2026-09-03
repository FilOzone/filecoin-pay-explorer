import { describe, expect, it, vi } from "vitest";
import {
  BASE_USDC,
  buildCardOnrampOptions,
  isFundingExit,
  isSandboxFlag,
  readOnrampEnvironment,
  runPrivyFunding,
  toCaipChainId,
} from "./privy-funding";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

describe("privy funding helpers", () => {
  it("builds card onramp options with a CAIP-2 chain and optional amount", () => {
    expect(
      buildCardOnrampOptions({ address: "0xabc", asset: BASE_USDC, chainId: 8453, environment: "production" }),
    ).toEqual({
      source: {},
      destination: { address: "0xabc", chain: "eip155:8453", asset: BASE_USDC },
      environment: "production",
    });
    expect(
      buildCardOnrampOptions({
        address: "0xabc",
        asset: BASE_USDC,
        chainId: 1,
        defaultAmount: "25",
        environment: "sandbox",
      }).defaultAmount,
    ).toBe("25");
    expect(toCaipChainId(314)).toBe("eip155:314");
  });

  it("treats only the user leaving a Privy modal as an exit", () => {
    const samples = {
      "User exited flow": true,
      "User exited the modal before submitting the transaction": true,
      sdk_deposit_address_exited: true,
      "Verification canceled": true,
      cancelled: true,
      "User rejected the request.": true,
      "Funding is not enabled for this app": false,
      "Connection closed": false,
      "Request cancelled by the network": false,
      "Failed to exit the vault": false,
    };
    expect(Object.fromEntries(Object.entries(samples).map(([m, _]) => [m, isFundingExit(new Error(m))]))).toEqual(
      samples,
    );
    expect(isFundingExit(undefined)).toBe(true);
    expect(isFundingExit(Object.assign(new Error("Something else"), { code: 4001 }))).toBe(true);
  });

  it("reports a completed flow, stays quiet when the user leaves, and toasts real failures", async () => {
    await expect(
      runPrivyFunding(async () => undefined, { unavailableTitle: "Card purchases are unavailable" }),
    ).resolves.toBe(true);
    await expect(
      runPrivyFunding(
        async () => {
          throw new Error("User exited flow");
        },
        { unavailableTitle: "Card purchases are unavailable" },
      ),
    ).resolves.toBe(false);
    expect(toast.error).not.toHaveBeenCalled();

    await expect(
      runPrivyFunding(
        async () => {
          throw new Error("Funding is not enabled for this app");
        },
        { unavailableTitle: "Card purchases are unavailable" },
      ),
    ).resolves.toBe(false);
    expect(toast.error.mock.calls).toEqual([
      ["Card purchases are unavailable", { description: "Funding is not enabled for this app" }],
    ]);
  });

  it("reads the sandbox flag from the environment", () => {
    expect(isSandboxFlag("true")).toBe(true);
    expect(isSandboxFlag("1")).toBe(true);
    expect(isSandboxFlag("false")).toBe(false);
    expect(isSandboxFlag(undefined)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_PRIVY_ONRAMP_SANDBOX", "true");
    expect(readOnrampEnvironment()).toBe("sandbox");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_ONRAMP_SANDBOX", "");
    expect(readOnrampEnvironment()).toBe("production");
  });
});
