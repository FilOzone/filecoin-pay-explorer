import type { Synapse } from "@filoz/synapse-sdk";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useAccountSummary from "./useAccountSummary";

const useQuery = vi.hoisted(() => vi.fn());
let synapse: Synapse | null = null;

vi.mock("@tanstack/react-query", () => ({ useQuery }));
vi.mock("@/hooks/useSynapse", () => ({ default: () => ({ synapse }) }));

const accountA = "0x1111111111111111111111111111111111111111";
const accountB = "0x2222222222222222222222222222222222222222";

function createSynapse(address: string) {
  return {
    chain: { id: 314 },
    client: { account: { address } },
    payments: { accountSummary: vi.fn() },
  } as unknown as Synapse;
}

function Harness({ address }: { address: string | undefined }) {
  useAccountSummary({ address, chainId: 314 });
  return null;
}

describe("useAccountSummary", () => {
  beforeEach(() => {
    synapse = null;
    useQuery.mockReset().mockReturnValue({});
  });

  it("keeps queryFn available while Synapse initializes", () => {
    act(() => {
      create(<Harness address={accountA} />);
    });

    const options = useQuery.mock.lastCall?.[0];
    expect(options.enabled).toBe(false);
    expect(options.queryFn).toBeTypeOf("function");
  });

  it("waits for Synapse to represent the connected account", () => {
    synapse = createSynapse(accountA);
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness address={accountB} />);
    });

    expect(useQuery.mock.lastCall?.[0].enabled).toBe(false);

    synapse = createSynapse(accountB);
    act(() => {
      renderer.update(<Harness address={accountB} />);
    });

    expect(useQuery.mock.lastCall?.[0].enabled).toBe(true);
  });
});
