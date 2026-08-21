import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunwayCard } from "./RunwayCard";

describe("RunwayCard", () => {
  it("shows the current and projected funding statuses beside the runway", () => {
    const markup = renderToStaticMarkup(
      <RunwayCard
        current={{ fundedThroughTimestamp: null, runwayInEpochs: 0n, status: "critical", suggestedTopUp: 1n }}
        projected={{
          fundedThroughTimestamp: null,
          runwayInEpochs: 0n,
          status: "no-active-spend",
          suggestedTopUp: 0n,
        }}
      />,
    );

    expect(markup).toContain("Current funded through:");
    expect(markup).toContain("(Critical)");
    expect(markup).toContain("Projected funded through:");
    expect(markup).toContain("(No active spend)");
  });
});
