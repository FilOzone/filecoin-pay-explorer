import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPermitDomainSeparator } from "@/utils/permit";
import { CUSTOM_OPTION } from "./constants";
import { useTokenSelection } from "./useTokenSelection";

const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const CHAIN_ID = 314159;

const mocks = vi.hoisted(() => ({
  readContracts: [] as Array<{ status: "success"; result: unknown }>,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x2222222222222222222222222222222222222222" }),
  useReadContract: () => ({ data: 1000n, isLoading: false }),
  useReadContracts: () => ({ data: mocks.readContracts, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({
    constants: {
      chain: { id: CHAIN_ID, slug: "calibration", blockExplorers: { default: { url: "https://example.com" } } },
      contracts: { payments: { address: "0x3333333333333333333333333333333333333333", abi: [] } },
    },
  }),
}));

beforeEach(() => {
  mocks.readContracts = [];
});

describe("useTokenSelection", () => {
  it("reads a custom token on the selected Filecoin chain and accepts it only when its onchain domain separator matches", () => {
    mocks.readContracts = [
      { status: "success", result: "TKN" },
      { status: "success", result: 18 },
      { status: "success", result: "Token Name" },
      { status: "success", result: 0n },
      { status: "success", result: getPermitDomainSeparator(TOKEN, "Token Name", CHAIN_ID) },
    ];
    let selection!: ReturnType<typeof useTokenSelection>;
    function Harness() {
      selection = useTokenSelection(true);
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness />);
    });
    act(() => selection.chooseToken(CUSTOM_OPTION));
    act(() => selection.enterCustomTokenAddress(TOKEN));
    expect(selection.supportsPermit).toBe(true);

    mocks.readContracts = mocks.readContracts.map((read, index) =>
      index === 4 ? { ...read, result: `0x${"00".repeat(32)}` } : read,
    );
    act(() => renderer.update(<Harness />));
    expect(selection.token?.name).toBe("Token Name");
    expect(selection.supportsPermit).toBe(false);
  });
});
