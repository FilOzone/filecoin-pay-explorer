import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
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
    return <div data-account-id={accountId} data-mount={mount} />;
  },
}));
vi.mock("../StaleQueue", () => ({
  StaleQueue: () => null,
}));

const PAYER = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";

describe("ServiceDetail", () => {
  it("shows not found when the payer has no relationship with the operator", () => {
    mocks.service = null;
    const markup = renderToStaticMarkup(
      <ServiceDetail network='mainnet' operatorAddress={OPERATOR} userAddress={PAYER} />,
    );

    expect(markup).toContain("Service not found");
    expect(markup).not.toContain("Payment rails");
  });

  it("remounts datasets when the payer changes", () => {
    mocks.service = { totalRails: "0" };
    mocks.datasetMounts = 0;
    const operatorAddress = getChain("mainnet").contracts.fwss.address;
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(<ServiceDetail network='mainnet' operatorAddress={operatorAddress} userAddress={PAYER} />);
    });
    expect(renderer.root.findByProps({ "data-account-id": PAYER }).props["data-mount"]).toBe(1);

    const nextPayer = "0x3333333333333333333333333333333333333333";
    act(() => {
      renderer.update(<ServiceDetail network='mainnet' operatorAddress={operatorAddress} userAddress={nextPayer} />);
    });
    expect(renderer.root.findByProps({ "data-account-id": nextPayer }).props["data-mount"]).toBe(2);
  });
});
