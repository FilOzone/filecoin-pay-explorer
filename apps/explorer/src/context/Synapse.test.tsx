// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { memo, useContext, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynapseContext, SynapseProvider } from "./Synapse";

const wallet = vi.hoisted(() => ({
  chainId: 314,
  client: { chain: "mainnet" } as { chain: string } | undefined,
  built: [] as unknown[],
}));

vi.mock("wagmi", () => ({
  useChainId: () => wallet.chainId,
  useConnectorClient: () => ({ data: wallet.client }),
}));
vi.mock("@filoz/synapse-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@filoz/synapse-sdk")>()),
  asClient: (client: unknown) => client,
  Synapse: class {
    client: unknown;
    constructor({ client }: { client: unknown }) {
      this.client = client;
      wallet.built.push(client);
    }
  },
}));

const seen: Array<{ client: unknown } | null> = [];
const Consumer = memo(function Consumer() {
  seen.push(useContext(SynapseContext)?.synapse as { client: unknown } | null);
  return null;
});

let rerenderParent: () => void = () => {};
function Parent() {
  const [, setTick] = useState(0);
  rerenderParent = () => setTick((tick) => tick + 1);
  return (
    <SynapseProvider>
      <Consumer />
    </SynapseProvider>
  );
}

afterEach(cleanup);

describe("SynapseProvider", () => {
  beforeEach(() => {
    wallet.chainId = 314;
    wallet.client = { chain: "mainnet" };
    wallet.built = [];
    seen.length = 0;
  });

  it("builds the SDK client on the first render, without a render of stale null state", () => {
    render(<Parent />);

    expect(seen).toEqual([{ client: { chain: "mainnet" } }]);
  });

  it("keeps the same value through an unrelated parent render", () => {
    render(<Parent />);
    act(() => rerenderParent());

    expect(seen).toHaveLength(1);
    expect(wallet.built).toHaveLength(1);
  });

  it("rebuilds the SDK client when the wallet moves to another supported chain", () => {
    const { rerender } = render(<Parent />);
    wallet.chainId = 314159;
    wallet.client = { chain: "calibration" };
    rerender(<Parent />);

    expect(seen.at(-1)).toEqual({ client: { chain: "calibration" } });
  });

  // During a top-up the wallet sits on a Squid source chain; the console still shows mainnet, but the SDK must not
  // be handed a client for the wrong chain.
  it("offers no SDK client while the wallet is on a Squid source chain", () => {
    wallet.chainId = 8453;
    wallet.client = { chain: "base" };
    render(<Parent />);

    expect(seen).toEqual([null]);
  });

  it("offers no SDK client until the connector has one", () => {
    wallet.client = undefined;
    render(<Parent />);

    expect(seen).toEqual([null]);
  });
});
