// @vitest-environment jsdom
import type { OperatorApproval } from "@filecoin-pay/types";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { maxUint256 } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import ApprovalsTable from "./ApprovalsTable";

vi.mock("@filecoin-foundation/ui-filecoin/Badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/assests/USDFCLogo", () => ({ default: () => null }));
vi.mock("@/components/shared/ServiceAddress", () => ({
  default: ({ value, networkOverride }: { value: string; networkOverride?: string }) => (
    <span data-testid='service' data-network={networkOverride}>
      {value}
    </span>
  ),
}));
vi.mock("@/components/shared/AllowanceDisplay", () => ({ default: () => null }));

const approval = (operator: string, maxLockupPeriod: bigint) =>
  ({
    id: operator,
    isApproved: true,
    maxLockupPeriod: maxLockupPeriod.toString(),
    lockupAllowance: "0",
    rateAllowance: "0",
    operator: { id: operator, address: operator },
    token: { symbol: "USDFC", decimals: "18" },
  }) as unknown as OperatorApproval;

const UNLIMITED = approval("0x1111111111111111111111111111111111111111", maxUint256);
const LIMITED = approval("0x2222222222222222222222222222222222222222", 86_400n);

afterEach(cleanup);

describe("ApprovalsTable", () => {
  const rowOf = (operator: string) => screen.getByRole("row", { name: new RegExp(operator) });

  it("shows an unlimited maximum lockup period as infinite and a limited one in epochs", () => {
    render(<ApprovalsTable data={[UNLIMITED, LIMITED]} onIncrease={vi.fn()} network='mainnet' />);

    const unlimited = within(rowOf(UNLIMITED.operator.address)).getByText(/Max:/);
    expect(unlimited.querySelector("svg.lucide-infinity")).not.toBeNull();
    expect(unlimited.textContent).not.toMatch(/\d/);
    expect(within(rowOf(LIMITED.operator.address)).getByText(/Max:/).textContent).toBe("Max: 86400 epochs");
  });

  it("increases the approval in the row whose action was clicked", () => {
    const onIncrease = vi.fn();
    render(<ApprovalsTable data={[UNLIMITED, LIMITED]} onIncrease={onIncrease} network='mainnet' />);

    fireEvent.click(within(rowOf(LIMITED.operator.address)).getByRole("button", { name: "Increase" }));
    expect(onIncrease).toHaveBeenCalledWith(LIMITED);
  });

  // Console pages never sync the shared network context, so the column must name the console network itself.
  it("names each service on the console network", () => {
    render(<ApprovalsTable data={[UNLIMITED]} onIncrease={vi.fn()} network='calibration' />);

    expect(screen.getByTestId("service").dataset.network).toBe("calibration");
  });
});
