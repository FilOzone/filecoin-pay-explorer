import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopUpActivityProvider, useTopUpActivity } from "../TopUpActivityContext";
import { beginSquidAcquisition } from "./data/squid-acquisition";
import { TopUpDialogController } from "./TopUpDialogController";

const replace = vi.fn();
let params = new URLSearchParams();
const dialog = vi.hoisted(() => ({
  onOpenChange: undefined as ((open: boolean) => void) | undefined,
  open: false,
  recoveryRevision: 0,
}));
let storageListener: (() => void) | undefined;
const storedValues = new Map<string, string>();
const storage = {
  getItem: (key: string) => storedValues.get(key) ?? null,
  removeItem: (key: string) => storedValues.delete(key),
  setItem: (key: string, value: string) => storedValues.set(key, value),
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isFetching: false }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/console",
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1111111111111111111111111111111111111111" }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ synapse: undefined }),
}));
vi.mock("./components", () => ({
  GuidedTopUpDialog: ({
    onOpenChange,
    open,
    recoveryRevision,
  }: {
    onOpenChange: (open: boolean) => void;
    open: boolean;
    recoveryRevision: number;
  }) => {
    dialog.onOpenChange = onOpenChange;
    dialog.open = open;
    dialog.recoveryRevision = recoveryRevision;
    return (
      <div data-guided-top-up-open={open} data-testid='dialog'>
        <button onClick={() => onOpenChange(false)} type='button'>
          Close
        </button>
      </div>
    );
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

function renderController() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TopUpActivityProvider>
        <TopUpDialogController accountId='0xabc' />
      </TopUpActivityProvider>,
    );
  });
  return renderer;
}

beforeEach(() => {
  dialog.onOpenChange = undefined;
  dialog.open = false;
  dialog.recoveryRevision = 0;
  storageListener = undefined;
  params = new URLSearchParams();
  replace.mockReset();
  storedValues.clear();
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "storage") storageListener = listener;
    }),
    localStorage: storage,
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TopUpDialogController activity", () => {
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

describe("TopUpDialogController deep link", () => {
  it("opens the dialog when ?topUp=1 is present", () => {
    params = new URLSearchParams("topUp=1&utm_source=email");
    const renderer = renderController();
    const renderedDialog = renderer.root.findByProps({ "data-testid": "dialog" });
    expect(renderedDialog.props["data-guided-top-up-open"]).toBe(true);
  });

  it("closing strips only the topUp param and preserves the rest", () => {
    params = new URLSearchParams("topUp=1&utm_source=email");
    const renderer = renderController();
    act(() => {
      renderer.root.findByType("button").props.onClick();
    });
    expect(replace).toHaveBeenCalledWith("/console?utm_source=email");
  });
});

describe("TopUpDialogController recovery", () => {
  it("auto-opens a saved acquisition and leaves a persistent launcher after close", () => {
    beginSquidAcquisition(
      storage,
      "0x1111111111111111111111111111111111111111",
      10n,
      100n,
      42161,
      "11111111-1111-4111-8111-111111111111",
    );
    const renderer = renderController();

    expect(dialog.open).toBe(true);
    act(() => dialog.onOpenChange?.(false));
    expect(dialog.open).toBe(false);

    const launcher = renderer.root.findByProps({ "aria-label": "View top-up in progress" });
    expect(JSON.stringify(renderer.toJSON())).toContain("Top-up in progress — view");
    expect(dialog.open).toBe(false);

    act(() => launcher.props.onClick());
    expect(dialog.open).toBe(true);
  });

  it("refreshes recovery state when another tab writes while the dialog is already open", () => {
    renderController();
    act(() => dialog.onOpenChange?.(true));
    expect(dialog.open).toBe(true);
    const initialRevision = dialog.recoveryRevision;

    beginSquidAcquisition(
      storage,
      "0x1111111111111111111111111111111111111111",
      10n,
      100n,
      42161,
      "11111111-1111-4111-8111-111111111111",
    );
    act(() => storageListener?.());

    expect(dialog.open).toBe(true);
    expect(dialog.recoveryRevision).toBe(initialRevision + 1);
  });
});
