import { useState } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ConsoleContent } from "./(console)/ConsoleContent";
import { getConsoleAccessState } from "./(console)/console-access";

describe("console access and continuity", () => {
  it("keeps the console page mounted on a Squid source chain", () => {
    expect(getConsoleAccessState({ isConnected: true, hasAddress: true, chainId: 8453 })).toBe("squid-source");
  });

  it("continues to reject unrelated unsupported chains", () => {
    expect(getConsoleAccessState({ isConnected: true, hasAddress: true, chainId: 12345 })).toBe("unsupported-chain");
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
