import { act, create, type ReactTestRendererNode } from "react-test-renderer";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
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

    // A destructive requested scope starts unchecked; the owner ticks it, then submits.
    const [, , , terminate] = renderer.root.findAllByProps({ type: "checkbox" });
    act(() => terminate.props.onChange({ target: { checked: true } }));
    await act(() => renderer.root.findByProps({ children: "Authorize as 0x0000...00aa" }).props.onClick());

    // The parent lists the key and passes it back, which re-runs the prefill
    // effect and unchecks the destructive scope again.
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

    expect(text(renderer.toJSON())).toContain(
      `${SIGNER} is now authorized to act for ${OWNER} with Create data set, Terminate service.`,
    );
  });
});
