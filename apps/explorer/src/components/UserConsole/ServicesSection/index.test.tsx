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

const observed = vi.hoisted(() => ({ accountId: "", metadataAddresses: [] as string[] }));
const onchain = vi.hoisted(() => ({ map: new Map<string, { name?: string; description?: string }>() }));

vi.mock("@/hooks/useAccountServices", () => ({
  useAccountServices: (accountId: string) => {
    observed.accountId = accountId;
    return servicesQuery;
  },
}));
vi.mock("@/hooks/useServiceMetadata", () => ({
  useServiceMetadata: (addresses: string[]) => {
    observed.metadataAddresses = addresses;
    return { metadata: onchain.map, isLoading: false };
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
    observed.metadataAddresses = [];
    onchain.map = new Map();
  });

  it("links Manage to the operator's own console route", () => {
    expect(render()).toContain(`href="/console/services/${WARM_STORAGE}"`);
  });

  it("lists every service across all fetched cursor pages", () => {
    servicesQuery.data = {
      pages: [{ services: [buildService(WARM_STORAGE)] }, { services: [buildService(UNKNOWN_OPERATOR)] }],
    };

    const markup = render();

    expect(markup).toContain("Filecoin Warm Storage Service");
    expect(markup).toContain("0x9999...9999");
  });

  it("queries the connected payer's account", () => {
    render();

    expect(observed.accountId).toBe(ACCOUNT_ID);
  });
});
