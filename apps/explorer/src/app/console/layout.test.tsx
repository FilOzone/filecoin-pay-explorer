import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ConsoleContent } from "./(console)/ConsoleContent";
import { ConsoleWalletControls } from "./(console)/ConsoleWalletControls";
import { getConsoleAccessState, getConsoleDisplayAccessState } from "./(console)/console-access";

vi.mock("@/components/shared/Balance", () => ({ default: () => <span>Filecoin balance</span> }));
vi.mock("@/components/shared/ChainSwitcher", () => ({ default: () => <span>Filecoin network</span> }));

describe("console access and continuity", () => {
  it("keeps the console page mounted on a Squid source chain", () => {
    expect(getConsoleAccessState({ isConnected: true, hasAddress: true, chainId: 8453 })).toBe("squid-source");
  });

  it("continues to reject unrelated unsupported chains", () => {
    expect(getConsoleAccessState({ isConnected: true, hasAddress: true, chainId: 12345 })).toBe("unsupported-chain");
    expect(getConsoleDisplayAccessState("unsupported-chain", true)).toBe("unsupported-chain");
  });

  it("displays the console only for an active top-up on a recognized source chain", () => {
    expect(getConsoleDisplayAccessState("squid-source", false)).toBe("squid-source");
    expect(getConsoleDisplayAccessState("squid-source", true)).toBe("ready");
  });

  it("shows the actual source wallet network only while the top-up is active", () => {
    const activeMarkup = renderToStaticMarkup(
      <ConsoleWalletControls accessState='squid-source' chainId={8453} isTopUpActive={true} />,
    );
    expect(activeMarkup).toContain("Wallet: Base");
    expect(activeMarkup).not.toContain("Unsupported Network");
    expect(activeMarkup).not.toContain("Filecoin balance");
    expect(activeMarkup).not.toContain("Filecoin network");

    const inactiveMarkup = renderToStaticMarkup(
      <ConsoleWalletControls accessState='squid-source' chainId={8453} isTopUpActive={false} />,
    );
    expect(inactiveMarkup).toContain("Unsupported Network");
    expect(inactiveMarkup).not.toContain("Wallet: Base");
  });

  it("preserves page state while switching to and from a Squid source chain", () => {
    let increment = () => {};
    const StatefulPage = () => {
      const [count, setCount] = useState(0);
      increment = () => setCount((value) => value + 1);
      return <span>{count}</span>;
    };
    const content = (accessState: "ready" | "squid-source") => (
      <ConsoleContent accessState={accessState} sidebar={<aside>Navigation</aside>}>
        <StatefulPage />
      </ConsoleContent>
    );

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(content("ready"));
    });
    act(increment);
    act(() => {
      renderer.update(content("squid-source"));
    });
    expect(renderer.root.findByType("span").children).toEqual(["1"]);
    act(() => {
      renderer.update(content("ready"));
    });
    expect(renderer.root.findByType("span").children).toEqual(["1"]);
  });
});
