import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountService } from "@/hooks/useAccountServices";
import { ServicesSection } from ".";

const servicesQuery = vi.hoisted(() => ({
  data: undefined as { pages: Array<{ services: unknown[] }> } | undefined,
  isLoading: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}));

const observed = vi.hoisted(() => ({ accountId: "" }));

vi.mock("@/hooks/useAccountServices", () => ({
  useAccountServices: (accountId: string) => {
    observed.accountId = accountId;
    return servicesQuery;
  },
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, href }: { children: React.ReactNode; href?: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/shared", () => ({
  CopyableText: ({ value }: { value: string }) => <span>{value}</span>,
}));

const WARM_STORAGE = "0x02925630df557f957f70e112ba06e50965417ca0";
const UNKNOWN_OPERATOR = "0x9999999999999999999999999999999999999999";
const ACCOUNT_ID = "0x1111111111111111111111111111111111111111";

const buildService = (address: string, overrides: Partial<AccountService> = {}) =>
  ({
    id: `${ACCOUNT_ID}${address.slice(2)}`,
    operator: { id: address, address },
    totalRails: 10n,
    totalActiveRails: 4n,
    totalApprovals: 1n,
    totalActiveApprovals: 1n,
    ...overrides,
  }) as unknown as AccountService;

const render = () => renderToStaticMarkup(<ServicesSection accountId={ACCOUNT_ID} network='mainnet' />);

describe("ServicesSection", () => {
  beforeEach(() => {
    servicesQuery.data = { pages: [{ services: [buildService(WARM_STORAGE)] }] };
    servicesQuery.isLoading = false;
    servicesQuery.isError = false;
    servicesQuery.hasNextPage = false;
    servicesQuery.isFetchingNextPage = false;
  });

  it("names the service from its metadata and links Manage to the operator route", () => {
    const markup = render();

    expect(markup).toContain("Filecoin Warm Storage Service");
    expect(markup).toContain(`href="/console/services/${WARM_STORAGE}"`);
  });

  it("reports active and lifetime rail counts for the pair", () => {
    const markup = render();

    expect(markup).toContain("4 active / 10 total rails");
  });

  it("falls back to the truncated operator address when the service is unknown", () => {
    servicesQuery.data = { pages: [{ services: [buildService(UNKNOWN_OPERATOR)] }] };

    expect(render()).toContain("0x9999...9999");
  });

  it("lists every service across all fetched cursor pages", () => {
    servicesQuery.data = {
      pages: [{ services: [buildService(WARM_STORAGE)] }, { services: [buildService(UNKNOWN_OPERATOR)] }],
    };

    const markup = render();

    expect(markup).toContain("Filecoin Warm Storage Service");
    expect(markup).toContain("0x9999...9999");
  });

  it("keeps an authorization-only relationship in the list", () => {
    servicesQuery.data = {
      pages: [{ services: [buildService(WARM_STORAGE, { totalRails: 0n, totalActiveRails: 0n } as never)] }],
    };

    const markup = render();

    expect(markup).toContain("Filecoin Warm Storage Service");
    expect(markup).toContain("0 active / 0 total rails");
  });

  it("offers Load more only while another cursor page remains", () => {
    expect(render()).not.toContain("Load more");

    servicesQuery.hasNextPage = true;
    expect(render()).toContain("Load more");
  });

  it("queries the connected payer's account", () => {
    render();

    expect(observed.accountId).toBe(ACCOUNT_ID);
  });

  it("shows the empty state when the payer has no service relationships", () => {
    servicesQuery.data = { pages: [{ services: [] }] };

    expect(render()).toContain("No services yet");
  });

  it("shows the error state when the query fails", () => {
    servicesQuery.isError = true;

    expect(render()).toContain("Failed to load services");
  });
});
