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
          crossChainAvailable
          onOpenChange={() => undefined}
          onSelect={onSelect}
          open
        />,
      );
    });

    expect(labelsOf(renderer)).toEqual(["Log in to buy with card", "Pay from another network", "Deposit USDFC"]);
    const visibleText = renderer.root.findAllByType("span").flatMap((node) => node.children);
    expect(visibleText).toContain(
      "USDC by default, or another token you hold on Ethereum, Base, Arbitrum and more. It arrives as USDFC in your account, with nothing to sign on Filecoin.",
    );
    expect(visibleText).toContain("Already hold USDFC or another token on Filecoin? Deposit it directly.");
    // The guided any-token swap is no longer a separate way in.
    expect(labelsOf(renderer)).not.toContain("Swap another token");

    for (const label of labelsOf(renderer)) {
      act(() => renderer.root.findByProps({ "aria-label": label }).props.onClick());
    }
    expect(onSelect.mock.calls).toEqual([["card"], ["crosschain"], ["deposit"]]);
  });

  it("keeps only the plain deposit where cross-network payments are unavailable", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <AddFundsDialog crossChainAvailable={false} onOpenChange={() => undefined} onSelect={() => undefined} open />,
      );
    });
    expect(labelsOf(renderer)).toEqual(["Deposit USDFC"]);
    expect(renderer.root.findAllByType("p")).toHaveLength(0);
  });
});
