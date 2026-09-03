import type { UserToken } from "@filecoin-pay/types";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "./FundingLaunchContext";

const SEED = { id: "account-usdfc" } as unknown as UserToken;

function Controls() {
  const launch = useFundingLaunch();
  return (
    <>
      <span
        data-open={launch.isUsdcFundingOpen}
        data-picker-open={launch.isAddFundsOpen}
        data-seed={launch.depositToken}
        data-swap={launch.guidedTopUp}
      />
      <button data-launch onClick={launch.openUsdcFunding} type='button' />
      <button data-close onClick={launch.closeUsdcFunding} type='button' />
      <button data-open-picker onClick={() => launch.openAddFunds()} type='button' />
      <button data-open-seeded onClick={() => launch.openAddFunds({ depositToken: SEED })} type='button' />
      <button data-close-picker onClick={launch.closeAddFunds} type='button' />
      <button data-register={launch.setGuidedTopUp} type='button' />
    </>
  );
}

function render() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <FundingLaunchProvider>
        <Controls />
      </FundingLaunchProvider>,
    );
  });
  return renderer;
}
const flag = (renderer: ReturnType<typeof create>, name: string) => renderer.root.findByType("span").props[name];
const press = (renderer: ReturnType<typeof create>, name: string) =>
  act(() => renderer.root.findByProps({ [name]: true }).props.onClick());

describe("FundingLaunchContext", () => {
  it("opens and closes the shared USDC funding dialog", () => {
    const renderer = render();
    expect(flag(renderer, "data-open")).toBe(false);
    press(renderer, "data-launch");
    expect(flag(renderer, "data-open")).toBe(true);
    press(renderer, "data-close");
    expect(flag(renderer, "data-open")).toBe(false);
  });

  it("opens and closes the shared add-funds request, remembering the token it named", () => {
    const renderer = render();
    expect(flag(renderer, "data-picker-open")).toBe(false);
    expect(flag(renderer, "data-seed")).toBeNull();
    press(renderer, "data-open-seeded");
    expect(flag(renderer, "data-picker-open")).toBe(true);
    expect(flag(renderer, "data-seed")).toBe(SEED);
    press(renderer, "data-close-picker");
    expect(flag(renderer, "data-picker-open")).toBe(false);
    // A request without a token clears the previous one.
    press(renderer, "data-open-picker");
    expect(flag(renderer, "data-seed")).toBeNull();
  });

  it("keeps the guided swap opener while a dashboard registers one", () => {
    const renderer = render();
    const register = renderer.root.findAll((node) => node.type === "button" && "data-register" in node.props)[0].props[
      "data-register"
    ];
    const openSwap = vi.fn();
    expect(flag(renderer, "data-swap")).toBeNull();
    act(() => register(openSwap));
    expect(flag(renderer, "data-swap")).toBe(openSwap);
    act(() => register(null));
    expect(flag(renderer, "data-swap")).toBeNull();
  });

  it("refuses to run outside the provider", () => {
    expect(() =>
      act(() => {
        create(<Controls />);
      }),
    ).toThrow("useFundingLaunch must be used within FundingLaunchProvider");
  });
});
