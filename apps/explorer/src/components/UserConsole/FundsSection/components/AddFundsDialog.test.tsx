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

    const deposit = renderer.root.findByProps({ "aria-label": "Deposit from Filecoin" });
    const swap = renderer.root.findByProps({ "aria-label": "Swap from another network" });
    const card = renderer.root.findByProps({ "aria-label": "Buy with a card" });
    const visibleText = renderer.root.findAllByType("span").flatMap((node) => node.children);
    expect(visibleText).toContain("Deposit from Filecoin");
    expect(visibleText).toContain("Swap from another network");
    expect(visibleText).toContain("Buy with a card");
    expect(visibleText).toContain("Move USDFC or another Filecoin token into your Pay balance.");
    expect(visibleText).toContain("Receive USDC on Base, then convert it to USDFC for Filecoin Pay.");
    expect(visibleText.join(" ")).toContain("Identity verification required");
    const methodOrder = renderer.root.findAllByType("button").map((node) => node.props["aria-label"]);
    expect(methodOrder).toEqual(["Swap from another network", "Buy with a card", "Deposit from Filecoin"]);

    act(() => card.props.onClick());
    act(() => deposit.props.onClick());
    act(() => swap.props.onClick());
    expect(onSelect.mock.calls).toEqual([["card"], ["deposit"], ["squid"]]);

    act(() =>
      renderer.update(
        <AddFundsDialog
          cardFirst
          guestAvailable
          onOpenChange={() => undefined}
          onSelect={onSelect}
          open
          squidAvailable
        />,
      ),
    );
    expect(renderer.root.findAllByType("button").map((node) => node.props["aria-label"])).toEqual([
      "Buy with a card",
      "Preview Apple Pay top-up",
      "Swap from another network",
      "Deposit from Filecoin",
    ]);
    const preview = renderer.root.findByProps({ "aria-label": "Preview Apple Pay top-up" });
    expect(renderer.root.findByProps({ id: preview.props["aria-describedby"] }).children).toEqual([
      "Coinbase estimate only · $5–$50 for US guests",
    ]);
    act(() => preview.props.onClick());
    expect(onSelect).toHaveBeenLastCalledWith("guest");
  });

  it("refuses to close while a card purchase is busy", () => {
    const onOpenChange = vi.fn();
    let renderer!: ReturnType<typeof create>;
    const render = (isBusy: boolean) => (
      <AddFundsDialog
        guestAvailable
        isBusy={isBusy}
        onOpenChange={onOpenChange}
        onSelect={vi.fn()}
        open
        squidAvailable
      />
    );
    act(() => {
      renderer = create(render(true));
    });

    expect(renderer.root.findByProps({ "aria-label": "Preview Apple Pay top-up" }).props.disabled).toBe(true);
    act(() => dialog.onOpenChange?.(false));
    expect(onOpenChange).not.toHaveBeenCalled();

    act(() => renderer.update(render(false)));
    act(() => dialog.onOpenChange?.(false));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes during a card balance check, which holds only the card", () => {
    const onOpenChange = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <AddFundsDialog
          cardFirst
          cardLabel='Check for purchased USDC'
          cardStatus='Looking for purchased USDC on Base.'
          guestAvailable
          isCardChecking
          onCardStartOver={vi.fn()}
          onOpenChange={onOpenChange}
          onSelect={vi.fn()}
          open
          squidAvailable
        />,
      );
    });

    const isDisabled = (label: string) => renderer.root.findByProps({ "aria-label": label }).props.disabled;
    expect(isDisabled("Check for purchased USDC")).toBe(true);
    expect(renderer.root.findByProps({ role: "status" }).children).toEqual(["Looking for purchased USDC on Base."]);
    expect(isDisabled("Preview Apple Pay top-up")).toBe(false);
    expect(isDisabled("Deposit from Filecoin")).toBe(false);
    expect(isDisabled("Swap from another network")).toBe(false);
    const startOver = renderer.root.find((node) => node.type === "button" && node.children.includes("Start over"));
    expect(startOver.props.disabled).toBe(false);

    act(() => dialog.onOpenChange?.(false));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
