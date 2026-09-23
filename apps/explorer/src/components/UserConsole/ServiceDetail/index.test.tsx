// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getChain } from "@/constants/chains";
import { ServiceDetail } from ".";

const mocks = vi.hoisted(() => ({
  service: null as { totalRails: string } | null,
  datasetMounts: 0,
}));

vi.mock("@/hooks/useAccountServices", () => ({
  useAccountService: () => ({ data: mocks.service, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useServiceProfiles", () => ({
  useServiceProfiles: () => () => ({}),
}));

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, href }: { children: React.ReactNode; href?: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/shared", () => ({
  CopyableText: ({ value }: { value: string }) => <span>{value}</span>,
}));

vi.mock("../RailsSection", () => ({
  RailsSection: () => <div>Payment rails</div>,
}));
vi.mock("../DatasetsSection", () => ({
  DatasetsSection: ({ accountId }: { accountId: string }) => {
    const [mount] = useState(() => ++mocks.datasetMounts);
    return <div data-testid='datasets' data-account-id={accountId} data-mount={mount} />;
  },
}));
vi.mock("../StaleQueue", () => ({
  StaleQueue: () => null,
}));

afterEach(cleanup);

const PAYER = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";
const FWSS = getChain("mainnet").contracts.fwss.address;

describe("ServiceDetail", () => {
  it("shows not found when the payer has no relationship with the operator", () => {
    mocks.service = null;
    render(<ServiceDetail network='mainnet' operatorAddress={OPERATOR} userAddress={PAYER} />);

    expect(screen.getByText("Service not found")).toBeTruthy();
    expect(screen.queryByText("Payment rails")).toBeNull();
  });

  it("skips datasets for an operator that isn't Warm Storage", () => {
    mocks.service = { totalRails: "1" };
    render(<ServiceDetail network='mainnet' operatorAddress={OPERATOR} userAddress={PAYER} />);

    expect(screen.getByText("Payment rails")).toBeTruthy();
    expect(screen.queryByTestId("datasets")).toBeNull();
  });

  it("remounts datasets when the payer changes", () => {
    mocks.service = { totalRails: "0" };
    mocks.datasetMounts = 0;

    const { rerender } = render(<ServiceDetail network='mainnet' operatorAddress={FWSS} userAddress={PAYER} />);
    expect(screen.getByTestId("datasets").dataset).toMatchObject({ accountId: PAYER, mount: "1" });

    const nextPayer = "0x3333333333333333333333333333333333333333";
    rerender(<ServiceDetail network='mainnet' operatorAddress={FWSS} userAddress={nextPayer} />);
    expect(screen.getByTestId("datasets").dataset).toMatchObject({ accountId: nextPayer, mount: "2" });
  });
});
