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

const labelsOf = (renderer: ReturnType<typeof create>) =>
  renderer.root.findAllByType("button").map((button) => button.props["aria-label"]);

describe("AddFundsDialog", () => {
  it("names every method by what it does and reports the chosen one", () => {
    const onSelect = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <AddFundsDialog
          cardLabel='Log in to buy with card'
          onOpenChange={() => undefined}
          onSelect={onSelect}
          open
          squidAvailable
        />,
      );
    });

    expect(labelsOf(renderer)).toEqual([
      "Log in to buy with card",
      "Pay with USDC",
      "Deposit USDFC",
      "Swap another token",
    ]);
    const visibleText = renderer.root.findAllByType("span").flatMap((node) => node.children);
    expect(visibleText).toContain("Already hold USDFC or another token on Filecoin? Deposit it directly.");
    expect(visibleText).toContain("Swap ETH, USDC and more from another network into USDFC, then deposit it.");

    for (const label of labelsOf(renderer)) {
      act(() => renderer.root.findByProps({ "aria-label": label }).props.onClick());
    }
    expect(onSelect.mock.calls).toEqual([["card"], ["usdc"], ["deposit"], ["squid"]]);
  });

  it("keeps only the plain deposit where Squid funding is unavailable", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <AddFundsDialog onOpenChange={() => undefined} onSelect={() => undefined} open squidAvailable={false} />,
      );
    });
    expect(labelsOf(renderer)).toEqual(["Deposit USDFC", "Swap another token"]);
    expect(renderer.root.findByProps({ "aria-label": "Swap another token" }).props.disabled).toBe(true);
  });

  it("keeps the swap card disabled while no dashboard can open the guided swap", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <AddFundsDialog
          onOpenChange={() => undefined}
          onSelect={() => undefined}
          open
          squidAvailable
          squidDisabledReason='Open the dashboard to swap another token.'
          swapAvailable={false}
        />,
      );
    });
    expect(labelsOf(renderer)).toEqual(["Buy USDC with card", "Pay with USDC", "Deposit USDFC", "Swap another token"]);
    expect(renderer.root.findByProps({ "aria-label": "Swap another token" }).props.disabled).toBe(true);
    const visibleText = renderer.root.findAllByType("span").flatMap((node) => node.children);
    expect(visibleText).toContain("Open the dashboard to swap another token.");
  });
});
