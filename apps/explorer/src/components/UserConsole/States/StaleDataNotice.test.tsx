import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import StaleDataNotice from "./StaleDataNotice";

describe("StaleDataNotice", () => {
  it("says the data is stale and why", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<StaleDataNotice error={new Error("Subgraph timed out")} />);
    });
    expect(renderer.root.findByType("span").children).toEqual([
      "Could not refresh your account, so this is the last data loaded. Subgraph timed out",
    ]);
    expect(renderer.root.findByType("div").props.role).toBe("alert");
  });
});
