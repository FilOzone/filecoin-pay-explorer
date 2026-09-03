import type { ReactNode } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { BetaBadge } from "./BetaBadge";

vi.mock("@filecoin-pay/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => <span data-tooltip>{children}</span>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
}));

describe("BetaBadge", () => {
  it("shows a short badge whose accessible name carries the caution", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<BetaBadge />);
    });
    const badge = renderer.root.findByType("button");
    expect(badge.children).toEqual(["Beta"]);
    expect(badge.props["aria-label"]).toContain("Check every transaction before confirming.");
    expect(renderer.root.findByProps({ "data-tooltip": true }).children.join("")).toContain("in beta");
  });
});
