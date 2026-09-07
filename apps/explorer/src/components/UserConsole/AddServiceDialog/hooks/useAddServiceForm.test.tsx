import { act, create } from "react-test-renderer";
import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { type AddServiceForm, useAddServiceForm } from "./useAddServiceForm";

const TOKEN = { address: "0x1111111111111111111111111111111111111111", symbol: "TKN", decimals: 18 };

function renderForm(args: Partial<Parameters<typeof useAddServiceForm>[0]> = {}) {
  let form!: AddServiceForm;
  function Harness() {
    form = useAddServiceForm({
      token: TOKEN,
      balance: 1000n * 10n ** 18n,
      supportsPermit: true,
      isOperatorSelected: true,
      isBusy: false,
      ...args,
    });
    return null;
  }
  act(() => {
    create(<Harness />);
  });
  // Callers read `.current` after each state-changing `act()` — a destructured
  // snapshot would freeze on the pre-update value instead of following re-renders.
  return {
    get current() {
      return form;
    },
  };
}

describe("useAddServiceForm", () => {
  it("can submit with the default unlimited limits and no deposit entered", () => {
    const form = renderForm();
    expect(form.current.canSubmit).toBe(true);
    expect(form.current.buildSubmitAmounts()).toEqual({
      parsedDeposit: null,
      lockupInWei: maxUint256,
      rateInWei: maxUint256,
    });
  });

  it("cannot submit while awaiting a wallet signature", () => {
    const form = renderForm({ isBusy: true });
    expect(form.current.canSubmit).toBe(false);
  });

  it("cannot submit without an operator selected", () => {
    const form = renderForm({ isOperatorSelected: false });
    expect(form.current.canSubmit).toBe(false);
  });

  it("cannot submit without a token selected", () => {
    const form = renderForm({ token: null });
    expect(form.current.canSubmit).toBe(false);
    expect(form.current.buildSubmitAmounts()).toBeNull();
  });

  it("accepts an explicit zero custom limit instead of treating it as unset (0n is a valid limit, not a missing one)", () => {
    const form = renderForm();
    act(() => form.current.setIsUnlimited(false));
    act(() => form.current.setLockupAllowance("0"));
    act(() => form.current.setRateAllowance("1"));

    expect(form.current.canSubmit).toBe(true);
    expect(form.current.buildSubmitAmounts()).toEqual({
      parsedDeposit: null,
      lockupInWei: 0n,
      rateInWei: 1_000_000_000_000_000_000n,
    });
  });

  it("rejects custom limits that are all zero (canSubmit is the gate; buildSubmitAmounts assumes it was already checked)", () => {
    const form = renderForm();
    act(() => form.current.setIsUnlimited(false));
    act(() => form.current.setLockupAllowance("0"));
    act(() => form.current.setRateAllowance("0"));

    expect(form.current.canSubmit).toBe(false);
  });

  it("rejects a negative-looking custom limit", () => {
    const form = renderForm();
    act(() => form.current.setIsUnlimited(false));
    act(() => form.current.setLockupAllowance("-1"));
    act(() => form.current.setRateAllowance("1"));

    expect(form.current.canSubmit).toBe(false);
  });

  it("rejects an unparseable deposit amount", () => {
    const form = renderForm();
    act(() => form.current.setDepositAmount("1e5"));
    expect(form.current.isDepositing).toBe(false);
    expect(form.current.canSubmit).toBe(false);
  });

  it("rejects a deposit exceeding the wallet balance", () => {
    const form = renderForm({ balance: 1n });
    act(() => form.current.setDepositAmount("2"));
    expect(form.current.hasSufficientBalance).toBe(false);
    expect(form.current.canSubmit).toBe(false);
  });

  it("rejects a deposit when the token doesn't support permit", () => {
    const form = renderForm({ supportsPermit: false });
    act(() => form.current.setDepositAmount("1"));
    expect(form.current.canSubmit).toBe(false);
  });

  it("clearAmounts resets only the deposit/limit values, not the show-limits disclosure", () => {
    const form = renderForm();
    act(() => form.current.toggleShowLimits());
    act(() => form.current.setDepositAmount("1"));
    act(() => form.current.setLockupAllowance("2"));
    act(() => form.current.setRateAllowance("3"));

    act(() => form.current.clearAmounts());
    expect(form.current.depositAmount).toBe("");
    expect(form.current.lockupAllowance).toBe("");
    expect(form.current.rateAllowance).toBe("");
    expect(form.current.showLimits).toBe(true);
  });

  it("reset restores every field including the show-limits disclosure and the unlimited default", () => {
    const form = renderForm();
    act(() => form.current.toggleShowLimits());
    act(() => form.current.setIsUnlimited(false));
    act(() => form.current.setDepositAmount("1"));

    act(() => form.current.reset());
    expect(form.current.depositAmount).toBe("");
    expect(form.current.showLimits).toBe(false);
    expect(form.current.isUnlimited).toBe(true);
  });
});
