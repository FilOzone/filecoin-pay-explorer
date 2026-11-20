import { act, create, type ReactTestRendererNode } from "react-test-renderer";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateKeyFlow } from "./CreateKeyFlow";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({
    children,
    variant,
    size,
    ...props
  }: React.ComponentProps<"button"> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogFooter: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));

const execute = vi.fn();
vi.mock("@/hooks/useContractTransaction", () => ({ useContractTransaction: () => ({ execute }) }));
// What the registry read-back returns; undefined (no grant) unless a test sets it.
const registryReads = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("wagmi", () => ({ useReadContracts: () => ({ data: registryReads.data }) }));

const trackSessionKeyCreated = vi.hoisted(() => vi.fn());
vi.mock("@/utils/funnel-analytics", () => ({ trackSessionKeyCreated }));

beforeEach(() => {
  registryReads.data = undefined;
  trackSessionKeyCreated.mockClear();
});

const OWNER = "0x00000000000000000000000000000000000000aa" as Hex;
const SIGNER = "0x00000000000000000000000000000000000000bb" as Hex;
const REGISTRY = { address: "0x00000000000000000000000000000000000000cc" as Hex, abi: [] };

/** The rendered text in document order, so a sentence split across elements can be matched. */
function text(node: ReactTestRendererNode | ReactTestRendererNode[] | null): string {
  if (node == null) return "";
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string") return node;
  return text(node.children);
}

describe("CreateKeyFlow success copy", () => {
  it("lists the submitted scopes after the parent echoes the confirmed key back", async () => {
    let onConfirmed: (() => void) | undefined;
    execute.mockImplementation(async (options: { onConfirmed: () => void }) => {
      onConfirmed = options.onConfirmed;
      return "0xhash";
    });
    const props = {
      open: true,
      onOpenChange: () => undefined,
      network: "calibration" as const,
      account: OWNER,
      registry: REGISTRY,
      prefillAddress: SIGNER,
      prefillScopes: ["createDataSet", "terminateService"] as const,
      onCreated: () => undefined,
    };
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<CreateKeyFlow {...props} prefillScopes={[...props.prefillScopes]} />);
    });

    // The owner unticks the destructive scope the link requested, then submits.
    const terminate = () => renderer.root.findAllByProps({ type: "checkbox" })[3];
    act(() => terminate().props.onChange({ target: { checked: false } }));
    await act(() => renderer.root.findByProps({ children: "Authorize as 0x0000...00aa" }).props.onClick());
    // The live form then differs from what was sent: the copy must not read it.
    act(() => terminate().props.onChange({ target: { checked: true } }));

    // The parent lists the key and passes it back before the login confirms.
    act(() => {
      renderer.update(
        <CreateKeyFlow
          {...props}
          prefillScopes={[...props.prefillScopes]}
          existingKey={{ name: "", scopes: ["createDataSet", "terminateService"], expirySec: null }}
        />,
      );
    });
    act(() => onConfirmed?.());

    expect(text(renderer.toJSON())).toContain(`${SIGNER} is now authorized to act for ${OWNER} with Create data set.`);
  });
});

describe("CreateKeyFlow confirmation from the registry", () => {
  // A wallet that never answers, like Privy's after its dialog is closed once the login was sent.
  const submitWithSilentWallet = async (extra: Partial<React.ComponentProps<typeof CreateKeyFlow>> = {}) => {
    let walletConfirmed = () => undefined;
    execute.mockImplementation((options: { onConfirmed: () => undefined }) => {
      walletConfirmed = options.onConfirmed;
      return new Promise(() => undefined);
    });
    let props = {
      open: true,
      onOpenChange: () => undefined,
      network: "calibration" as const,
      account: OWNER,
      registry: REGISTRY,
      prefillAddress: SIGNER,
      prefillScopes: ["createDataSet" as const],
      onCreated: () => undefined,
      ...extra,
    };
    let renderer!: ReturnType<typeof create>;
    const render = (next: Partial<typeof props> = {}) => {
      props = { ...props, ...next };
      act(() => renderer.update(<CreateKeyFlow {...props} />));
    };
    const authorize = () =>
      act(async () => {
        renderer.root.findByProps({ children: "Authorize as 0x0000...00aa" }).props.onClick();
      });
    act(() => {
      renderer = create(<CreateKeyFlow {...props} />);
    });
    await authorize();
    return {
      renderer,
      authorize,
      // One read per pending submission, in submission order.
      readBack: (...expiries: bigint[]) => {
        registryReads.data = expiries.map((result) => ({ status: "success", result }));
        render();
      },
      reopen: (next: Partial<typeof props> = {}) => {
        render({ open: false });
        render({ open: true, ...next });
      },
      walletConfirms: () => act(() => walletConfirmed()),
    };
  };

  it("confirms once the registry holds the grant at the submitted expiry", async () => {
    const { renderer, readBack } = await submitWithSilentWallet();

    readBack(2n ** 64n);

    expect(text(renderer.toJSON())).toContain(`${SIGNER} is now authorized to act for ${OWNER} with Create data set.`);
  });

  it("keeps waiting while the registry only holds an older, shorter grant", async () => {
    const { renderer, readBack } = await submitWithSilentWallet();

    readBack(1n);

    expect(text(renderer.toJSON())).not.toContain("is now authorized");
    expect(text(renderer.toJSON())).toContain("Waiting for your wallet…");
  });

  it("confirms once when both the wallet receipt and the registry land", async () => {
    const onConfirmed = vi.fn();
    const { readBack, walletConfirms } = await submitWithSilentWallet({ onConfirmed });

    readBack(2n ** 64n);
    walletConfirms();

    expect(onConfirmed.mock.calls).toEqual([[SIGNER]]);
  });

  it("holds Authorize when reopened on a key whose login is still pending", async () => {
    const { renderer, reopen } = await submitWithSilentWallet();

    reopen();

    const held = renderer.root.find(
      (node) =>
        node.type === "button" && node.findAll((c) => c.children.includes("Waiting for confirmation…")).length > 0,
    );
    expect(held.props.disabled).toBe(true);
  });

  it("keeps checking the first key when a second one is submitted before it lands", async () => {
    const onCreated = vi.fn();
    const { authorize, readBack, reopen } = await submitWithSilentWallet({ onCreated });

    reopen({ prefillAddress: "0x00000000000000000000000000000000000000dd" });
    await authorize();
    readBack(2n ** 64n, 0n);

    expect(onCreated.mock.calls.map(([record]) => record.sessionKeyPublic)).toEqual([SIGNER]);
  });
});

describe("CreateKeyFlow funnel event", () => {
  const submit = async (extra: Partial<React.ComponentProps<typeof CreateKeyFlow>>, button: string) => {
    let walletConfirmed = () => undefined;
    let walletReverted = () => undefined;
    execute.mockImplementation((options: { onConfirmed: () => undefined; onReverted: () => undefined }) => {
      walletConfirmed = options.onConfirmed;
      walletReverted = options.onReverted;
      return new Promise(() => undefined);
    });
    const props = {
      open: true,
      onOpenChange: () => undefined,
      network: "mainnet" as const,
      account: OWNER,
      registry: REGISTRY,
      onCreated: () => undefined,
      ...extra,
    };
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<CreateKeyFlow {...props} />);
    });
    act(() => renderer.root.findAllByProps({ type: "checkbox" })[0].props.onChange({ target: { checked: true } }));
    await act(async () => {
      renderer.root.findByProps({ children: button }).props.onClick();
    });
    return {
      walletConfirms: () => act(() => walletConfirmed()),
      walletReverts: () => act(() => walletReverted()),
      registryConfirms: () => {
        registryReads.data = [{ status: "success", result: 2n ** 64n }];
        act(() => renderer.update(<CreateKeyFlow {...props} />));
      },
    };
  };

  it("reports a key the console generated when the wallet confirms its login", async () => {
    const { walletConfirms } = await submit({}, "Create session key");
    expect(trackSessionKeyCreated).not.toHaveBeenCalled();

    walletConfirms();

    expect(trackSessionKeyCreated.mock.calls).toEqual([["mainnet"]]);
  });

  it("reports a generated key when the registry confirms it, and not again when the wallet does", async () => {
    const { registryConfirms, walletConfirms } = await submit({}, "Create session key");

    registryConfirms();
    expect(trackSessionKeyCreated.mock.calls).toEqual([["mainnet"]]);

    walletConfirms();

    expect(trackSessionKeyCreated.mock.calls).toEqual([["mainnet"]]);
  });

  it("does not report a generated key whose login reverts", async () => {
    const { walletReverts } = await submit({}, "Create session key");

    walletReverts();

    expect(trackSessionKeyCreated).not.toHaveBeenCalled();
  });

  it("does not report an address the owner brought, which may already hold a login", async () => {
    const { walletConfirms } = await submit({ prefillAddress: SIGNER }, "Authorize as 0x0000...00aa");

    walletConfirms();

    expect(trackSessionKeyCreated).not.toHaveBeenCalled();
  });
});
