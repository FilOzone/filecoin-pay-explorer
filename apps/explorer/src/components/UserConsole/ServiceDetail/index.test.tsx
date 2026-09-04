import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountService } from "@/hooks/useAccountServices";
import { ServiceDetail } from ".";

const serviceQuery = vi.hoisted(() => ({
  data: undefined as AccountService | null | undefined,
  isLoading: false,
  isError: false,
}));

const observed = vi.hoisted(() => ({
  lookup: { accountId: "", operatorAddress: "" },
  railsProps: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/useAccountServices", () => ({
  useAccountService: (accountId: string, operatorAddress: string) => {
    observed.lookup = { accountId, operatorAddress };
    return serviceQuery;
  },
}));
vi.mock("../RailsSection", () => ({
  RailsSection: (props: Record<string, unknown>) => {
    observed.railsProps = props;
    return <div>Rails</div>;
  },
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, href }: { children: React.ReactNode; href?: string }) => <a href={href}>{children}</a>,
}));
// Renders an anchor exactly when `to` is passed, so a test can tell whether the
// header asked for a link.
vi.mock("@/components/shared", () => ({
  CopyableText: ({ value, to }: { value: string; to?: string }) =>
    to ? <a href={to}>{value}</a> : <span>{value}</span>,
}));

const WARM_STORAGE = "0x02925630df557f957f70e112ba06e50965417ca0";
const UNRELATED_OPERATOR = "0x9999999999999999999999999999999999999999";
// Checksummed, as wagmi reports it.
const WALLET = "0xAbC1111111111111111111111111111111111111";
const CHECKSUMMED_WARM_STORAGE = "0x02925630Df557f957f70E112bA06e50965417cA0";

const service = {
  id: `${WALLET.toLowerCase()}${WARM_STORAGE.slice(2)}`,
  operator: { id: WARM_STORAGE, address: WARM_STORAGE },
  totalRails: 25n,
  totalActiveRails: 4n,
  totalApprovals: 1n,
  totalActiveApprovals: 1n,
} as unknown as AccountService;

const render = (operatorAddress = WARM_STORAGE) =>
  renderToStaticMarkup(<ServiceDetail network='mainnet' operatorAddress={operatorAddress} userAddress={WALLET} />);

describe("ServiceDetail", () => {
  beforeEach(() => {
    serviceQuery.data = service;
    serviceQuery.isLoading = false;
    serviceQuery.isError = false;
    observed.railsProps = {};
  });

  it("renders the service name, description, and homepage", () => {
    const markup = render();

    expect(markup).toContain("Filecoin Warm Storage Service");
    expect(markup).toContain("Warm storage service for the Filecoin Onchain Cloud");
    expect(markup).toContain("https://github.com/filozone/filecoin-services");
  });

  it("renders the published prices", () => {
    const markup = render();

    expect(markup).toContain("2.5 USDFC");
    expect(markup).toContain("per TiB / month");
    expect(markup).toContain("0.02 USDFC");
  });

  it("looks the relationship up against the connected payer, lowercased", () => {
    render();

    expect(observed.lookup).toEqual({ accountId: WALLET.toLowerCase(), operatorAddress: WARM_STORAGE });
  });

  it("scopes the rail list to the payer and operator, paging on the pair's count", () => {
    render();

    expect(observed.railsProps.accountId).toBe(WALLET.toLowerCase());
    expect(observed.railsProps.operatorAddress).toBe(WARM_STORAGE);
    expect(observed.railsProps.totalRails).toBe(25n);
  });

  it("renders the homepage as copyable text, not a link", () => {
    const markup = render();

    expect(markup).toContain("https://github.com/filozone/filecoin-services");
    expect(markup).not.toContain("href=");
  });

  it("shows the console not-found state for an operator the payer has no relationship with", () => {
    serviceQuery.data = null;

    const markup = render(UNRELATED_OPERATOR);

    expect(markup).toContain("Service not found");
    expect(markup).not.toContain("Rails");
  });

  it("normalizes a checksummed URL segment to the indexed lowercase address", () => {
    render(CHECKSUMMED_WARM_STORAGE);

    expect(observed.lookup.operatorAddress).toBe(WARM_STORAGE);
    expect(observed.railsProps.operatorAddress).toBe(WARM_STORAGE);
  });

  it("shows the error state when the relationship query fails", () => {
    serviceQuery.isError = true;

    expect(render()).toContain("Failed to load service");
  });

  it("omits the pricing section for a service with no published prices", () => {
    const markup = render(UNRELATED_OPERATOR);

    expect(markup).toContain("Rails");
    expect(markup).not.toContain("Pricing");
  });
});
