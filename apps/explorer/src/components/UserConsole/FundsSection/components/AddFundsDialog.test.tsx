import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AddFundsDialog } from "./AddFundsDialog";

vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
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

  it("offers a separate explicit restart after a delayed card purchase", () => {
    const onRestart = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <AddFundsDialog
          cardLabel='Check for purchased USDC'
          onOpenChange={() => undefined}
          onSelect={() => undefined}
          onStartNewCardPurchase={onRestart}
          open
          squidAvailable
        />,
      );
    });

    const restart = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Start another purchase"));
    act(() => restart?.props.onClick());
    expect(onRestart).toHaveBeenCalledOnce();
  });
});
