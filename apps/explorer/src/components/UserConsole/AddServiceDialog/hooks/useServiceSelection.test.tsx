import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useServiceSelection } from "./useServiceSelection";

const mocks = vi.hoisted(() => ({
  approvableServicesOptions: undefined as { enabled?: boolean } | undefined,
}));

vi.mock("@/hooks/useApprovableServices", () => ({
  useApprovableServices: (options: { enabled?: boolean }) => {
    mocks.approvableServicesOptions = options;
    return { services: [], isLoading: false };
  },
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({
    constants: {
      chain: { id: 314159, slug: "calibration", blockExplorers: { default: { url: "https://example.com" } } },
    },
  }),
}));

beforeEach(() => {
  mocks.approvableServicesOptions = undefined;
});

describe("useServiceSelection", () => {
  it("only enables service discovery while the dialog is open", () => {
    function Harness({ open }: { open: boolean }) {
      useServiceSelection(open);
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness open={false} />);
    });
    expect(mocks.approvableServicesOptions?.enabled).toBe(false);

    act(() => renderer.update(<Harness open={true} />));
    expect(mocks.approvableServicesOptions?.enabled).toBe(true);
  });
});
