import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "./FundingLaunchContext";

function Consumer() {
  const launch = useFundingLaunch();
  return (
    <div data-open={launch.isAddFundsOpen} data-token={launch.depositToken?.id ?? ""}>
      <button onClick={() => launch.openAddFunds({ id: "token-1" } as never)} type='button'>
        Open
      </button>
      <button onClick={launch.closeAddFunds} type='button'>
        Close
      </button>
      <button onClick={() => launch.openAddFunds()} type='button'>
        Reopen
      </button>
    </div>
  );
}

describe("FundingLaunchProvider", () => {
  it("opens with the requested token and clears the seed on a later unseeded request", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <FundingLaunchProvider>
          <Consumer />
        </FundingLaunchProvider>,
      );
    });

    const buttons = renderer.root.findAllByType("button");
    act(() => buttons[0].props.onClick());
    expect(renderer.root.findByProps({ "data-open": true }).props["data-token"]).toBe("token-1");
    act(() => buttons[1].props.onClick());
    expect(renderer.root.findByProps({ "data-open": false }).props["data-token"]).toBe("token-1");
    act(() => buttons[2].props.onClick());
    expect(renderer.root.findByProps({ "data-open": true }).props["data-token"]).toBe("");
  });
});
