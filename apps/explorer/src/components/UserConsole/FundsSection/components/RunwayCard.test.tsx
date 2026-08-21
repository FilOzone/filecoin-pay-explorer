import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunwayCard } from "./RunwayCard";

describe("RunwayCard", () => {
  it("shows the current and projected funding statuses beside the runway", () => {
    const markup = renderToStaticMarkup(
      <RunwayCard
        current={{
          fundedThroughTimestamp: 1_735_689_600n,
          runwayInEpochs: 1n,
          status: "critical",
          suggestedTopUp: 1n,
        }}
        projected={{
          fundedThroughTimestamp: 1_738_368_000n,
          runwayInEpochs: 1n,
          status: "funded",
          suggestedTopUp: 0n,
        }}
      />,
    );

    expect(markup).toContain("Current funded through:");
    expect(markup).toContain("(Critical)");
    expect(markup).toContain("Projected funded through:");
    expect(markup).toContain("(Funded)");
    expect(markup.match(/<span class="sr-only">Approximately /g)).toHaveLength(2);
    expect(markup.match(/~/g)).toHaveLength(2);
  });
});
