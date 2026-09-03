import type { ReactNode } from "react";
import { act, create } from "react-test-renderer";
import type { Hash } from "viem";
import { describe, expect, it, vi } from "vitest";
import { PendingDepositPanel } from "./PendingDepositPanel";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({
    "aria-label": ariaLabel,
    children,
    onClick,
  }: {
    "aria-label"?: string;
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button aria-label={ariaLabel} onClick={onClick} type='button'>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/TextLink/ExternalTextLink", () => ({
  ExternalTextLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const pendingDeposit = {
  recipient: "0x2222222222222222222222222222222222222222" as const,
  owner: "0x1111111111111111111111111111111111111111" as const,
  sourceChainId: 8453,
  quoteId: "quote-1",
  transactionHash: `0x${"a".repeat(64)}` as Hash,
  sourceAmount: 25_000_000n,
  sourceSymbol: "USDC",
  sourceDecimals: 6,
  minimumDestinationAmount: 22n * 10n ** 18n,
  fundsBefore: 0n,
  startedAt: 1,
};

describe("PendingDepositPanel", () => {
  it("names the deposit, links the explorer by name, and asks before dismissing", () => {
    const onDismiss = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <PendingDepositPanel
          activeStage='bridging'
          error={null}
          explorerName='Basescan'
          explorerUrl='https://basescan.org'
          hasApproved
          isBusy={false}
          isEmbedded={false}
          onCheckAgain={() => undefined}
          onDismiss={onDismiss}
          pendingDeposit={pendingDeposit}
        />,
      );
    });
    const markup = JSON.stringify(renderer.toJSON());
    expect(markup).toContain("25 USDC from Base, arriving as at least ");
    const [explorer, squid] = renderer.root.findAllByType("a");
    expect(explorer.props.href).toBe(`https://basescan.org/tx/${pendingDeposit.transactionHash}`);
    expect(explorer.children).toEqual(["View on ", "Basescan"]);
    expect(squid.props.href).toBe(`https://scan.squidrouter.com/tx/${pendingDeposit.transactionHash}`);
    expect(squid.children).toEqual(["Track on Squid"]);

    act(() => renderer.root.findByProps({ "aria-label": "Dismiss pending deposit" }).props.onClick());
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => renderer.root.findByProps({ "aria-label": "Keep following the deposit" }).props.onClick());
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm dismissing the deposit" })).toHaveLength(0);

    act(() => renderer.root.findByProps({ "aria-label": "Dismiss pending deposit" }).props.onClick());
    act(() => renderer.root.findByProps({ "aria-label": "Confirm dismissing the deposit" }).props.onClick());
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
