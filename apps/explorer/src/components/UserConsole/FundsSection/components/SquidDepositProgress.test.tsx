import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { SquidDepositProgress } from "./SquidDepositProgress";

const ROUTE_HASH = `0x${"ab".repeat(32)}` as const;

type Props = Parameters<typeof SquidDepositProgress>[0];

function render(props: Partial<Props> = {}) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <SquidDepositProgress
        explorerUrl='https://basescan.org'
        hasApproved={false}
        isEmbedded={false}
        stage='preparing'
        symbol='USDC'
        transactionHash={null}
        {...props}
      />,
    );
  });
  return renderer;
}

/** Each step as [label, state], the state read from the label's styling. */
const steps = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType("li").map((item) => {
    const label = item.findAllByType("span").at(-1);
    const text = label?.children.join("");
    const state = label?.props.className === "font-medium" ? "current" : "other";
    return [text, state];
  });
const instruction = (renderer: ReactTestRenderer) => renderer.root.findAllByType("p")[0]?.children.join("");

describe("SquidDepositProgress", () => {
  it("lists the route steps without an approval until one is signed", () => {
    const renderer = render();
    expect(steps(renderer)).toEqual([
      ["Prepare the route", "current"],
      ["Confirm the swap", "other"],
      ["Source network confirms", "other"],
      ["Bridge and deposit", "other"],
      ["Balance confirmed", "other"],
    ]);
    expect(instruction(renderer)).toBe("Preparing the route…");
    expect(renderer.root.findAllByType("a")).toHaveLength(0);
  });

  it("numbers the approval and the swap as two signatures", () => {
    const renderer = render({ stage: "approving" });
    expect(steps(renderer)).toEqual([
      ["Prepare the route", "other"],
      ["Approve USDC", "current"],
      ["Confirm the swap", "other"],
      ["Source network confirms", "other"],
      ["Bridge and deposit", "other"],
      ["Balance confirmed", "other"],
    ]);
    expect(instruction(renderer)).toBe("Step 1 of 2: approve USDC in your wallet");

    act(() => {
      renderer.update(
        <SquidDepositProgress
          explorerUrl='https://basescan.org'
          hasApproved
          isEmbedded
          stage='swap-requested'
          symbol='USDC'
          transactionHash={null}
        />,
      );
    });
    expect(steps(renderer).map(([label]) => label)).toContain("Approve USDC");
    expect(instruction(renderer)).toBe("Step 2 of 2: signing the swap with your Privy wallet…");
  });

  it("links the source transaction and the Squid route once the swap is broadcast", () => {
    const renderer = render({ stage: "swap-broadcast", transactionHash: ROUTE_HASH });
    const links = renderer.root.findAllByType("a").map((link) => [link.children.join(""), link.props.href]);
    expect(links).toEqual([
      ["Source transaction", `https://basescan.org/tx/${ROUTE_HASH}`],
      ["Squid route / add gas", `https://axelarscan.io/gmp/${ROUTE_HASH}`],
    ]);
    expect(instruction(renderer)).toBe("Waiting for the source network to confirm…");
  });

  it("omits the source link when the network has no explorer", () => {
    const renderer = render({ explorerUrl: undefined, stage: "bridging", transactionHash: ROUTE_HASH });
    expect(renderer.root.findAllByType("a").map((link) => link.children.join(""))).toEqual(["Squid route / add gas"]);
  });
});
