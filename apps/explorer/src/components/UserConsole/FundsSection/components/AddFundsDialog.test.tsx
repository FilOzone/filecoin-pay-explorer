import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AddFundsDialog } from "./AddFundsDialog";

const dialog = vi.hoisted(() => ({ onOpenChange: undefined as ((open: boolean) => void) | undefined }));

vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange: (open: boolean) => void }) => {
    dialog.onOpenChange = onOpenChange;
    return children;
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));

describe("AddFundsDialog", () => {
  it("names all funding actions by what they do and preserves their selection values", () => {
    const onSelect = vi.fn();
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(<AddFundsDialog onOpenChange={() => undefined} onSelect={onSelect} open squidAvailable />);
    });

    const deposit = renderer.root.findByProps({ "aria-label": "Deposit token" });
    const swap = renderer.root.findByProps({ "aria-label": "Swap to USDFC" });
    const card = renderer.root.findByProps({ "aria-label": "Buy USDC with card" });
    const visibleText = renderer.root.findAllByType("span").flatMap((node) => node.children);
    expect(visibleText).toContain("Deposit token");
    expect(visibleText).toContain("Swap to USDFC");
    expect(visibleText).toContain("Buy USDC with card");
    expect(visibleText).toContain("Already hold USDFC or another token on Filecoin? Deposit it directly.");

    act(() => card.props.onClick());
    act(() => deposit.props.onClick());
    act(() => swap.props.onClick());
    expect(onSelect.mock.calls).toEqual([["card"], ["deposit"], ["squid"]]);
  });

  it("refuses to close while a card purchase is busy", () => {
    const onOpenChange = vi.fn();
    let renderer!: ReturnType<typeof create>;
    const render = (isBusy: boolean) => (
      <AddFundsDialog isBusy={isBusy} onOpenChange={onOpenChange} onSelect={vi.fn()} open squidAvailable />
    );
    act(() => {
      renderer = create(render(true));
    });

    act(() => dialog.onOpenChange?.(false));
    expect(onOpenChange).not.toHaveBeenCalled();

    act(() => renderer.update(render(false)));
    act(() => dialog.onOpenChange?.(false));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
