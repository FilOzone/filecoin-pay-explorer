import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopUpActivityProvider, useTopUpActivity } from "../TopUpActivityContext";
import { TopUpDialogController } from "./TopUpDialogController";

const dialog = vi.hoisted(() => ({
  onOpenChange: undefined as ((open: boolean) => void) | undefined,
  open: false,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isFetching: false }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/console",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1111111111111111111111111111111111111111" }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ synapse: undefined }),
}));
vi.mock("./components", () => ({
  GuidedTopUpDialog: ({ onOpenChange, open }: { onOpenChange: (open: boolean) => void; open: boolean }) => {
    dialog.onOpenChange = onOpenChange;
    dialog.open = open;
    return <div data-guided-top-up-open={open} />;
  },
}));

function ActivityState() {
  const { isTopUpActive } = useTopUpActivity();
  return <span data-top-up-active={isTopUpActive}>{String(isTopUpActive)}</span>;
}

function Harness({ showController = true }: { showController?: boolean }) {
  return (
    <TopUpActivityProvider>
      <ActivityState />
      {showController ? (
        <TopUpDialogController accountId='account'>
          {(openTopUp) => (
            <button data-open-top-up onClick={openTopUp} type='button'>
              Open
            </button>
          )}
        </TopUpDialogController>
      ) : null}
    </TopUpActivityProvider>
  );
}

describe("TopUpDialogController activity", () => {
  beforeEach(() => {
    dialog.onOpenChange = undefined;
    dialog.open = false;
  });

  it("propagates real open, close, and controller cleanup through the activity provider", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness />);
    });
    expect(renderer.root.findByProps({ "data-top-up-active": false }).children).toEqual(["false"]);

    act(() => renderer.root.findByProps({ "data-open-top-up": true }).props.onClick());
    expect(dialog.open).toBe(true);
    expect(renderer.root.findByProps({ "data-top-up-active": true }).children).toEqual(["true"]);

    act(() => dialog.onOpenChange?.(false));
    expect(dialog.open).toBe(false);
    expect(renderer.root.findByProps({ "data-top-up-active": false }).children).toEqual(["false"]);

    act(() => renderer.root.findByProps({ "data-open-top-up": true }).props.onClick());
    expect(renderer.root.findByProps({ "data-top-up-active": true }).children).toEqual(["true"]);
    act(() => renderer.update(<Harness showController={false} />));
    expect(renderer.root.findByProps({ "data-top-up-active": false }).children).toEqual(["false"]);
  });
});
