import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountService } from "@/hooks/useAccountServices";
import { ConsoleSidebar } from "./ConsoleSidebar";

const state = vi.hoisted(() => ({
  pathname: "/console",
  address: "0xABCDEF0000000000000000000000000000000001" as string | undefined,
  pages: [] as AccountService[][],
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: vi.fn(async () => undefined),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: state.address, chainId: 314 }) }));
vi.mock("@/utils/network", () => ({
  getNetworkFromChainId: () => "mainnet",
  isNotificationsEligibleNetwork: () => true,
}));
vi.mock("@/hooks/useNotificationStatus", () => ({ useNotificationStatus: () => ({ data: undefined }) }));
vi.mock("@/hooks/useAccountServices", () => ({
  useAccountServices: () => ({
    data: { pages: state.pages.map((services) => ({ services })) },
    fetchNextPage: state.fetchNextPage,
    hasNextPage: state.hasNextPage,
    isFetchingNextPage: state.isFetchingNextPage,
    isFetchNextPageError: state.isFetchNextPageError,
  }),
}));
vi.mock("@/hooks/useServiceProfiles", () => ({
  useServiceProfiles: () => (address: string) => ({
    name:
      address.toLowerCase() === "0x02925630df557f957f70e112ba06e50965417ca0"
        ? "Filecoin Warm Storage Service"
        : "0x9999...9999",
  }),
}));

const WARM_STORAGE = "0x02925630df557f957f70e112ba06e50965417ca0";
const UNKNOWN_OPERATOR = "0x9999999999999999999999999999999999999999";

function service(address: string): AccountService {
  return { id: address, operator: { id: address, address } } as AccountService;
}

async function renderSidebar(onAddService = vi.fn()): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ConsoleSidebar onAddService={onAddService} />);
  });
  return renderer;
}

function link(renderer: ReactTestRenderer, href: string): ReactTestInstance {
  const item = renderer.root.findAllByType("a").find((candidate) => candidate.props.href === href);
  if (!item) throw new Error(`Missing link: ${href}`);
  return item;
}

describe("ConsoleSidebar", () => {
  beforeEach(() => {
    state.pathname = "/console";
    state.address = "0xABCDEF0000000000000000000000000000000001";
    state.pages = [];
    state.hasNextPage = false;
    state.isFetchingNextPage = false;
    state.isFetchNextPageError = false;
    state.fetchNextPage.mockClear();
  });

  it("lists every fetched service and highlights the active operator", async () => {
    state.pages = [[service(WARM_STORAGE)], [service(UNKNOWN_OPERATOR)]];
    state.pathname = `/console/services/${UNKNOWN_OPERATOR}`;

    const renderer = await renderSidebar();
    const warmStorageLink = link(renderer, `/console/services/${WARM_STORAGE}`);
    const unknownOperatorLink = link(renderer, `/console/services/${UNKNOWN_OPERATOR}`);

    expect(warmStorageLink.findByType("span").children).toEqual(["Filecoin Warm Storage Service"]);
    expect(unknownOperatorLink.findByType("span").children).toEqual(["0x9999...9999"]);
    expect(unknownOperatorLink.props["aria-current"]).toBe("page");
  });

  it("keeps the fixed navigation and Add service when the account has no services", async () => {
    const onAddService = vi.fn();
    const renderer = await renderSidebar(onAddService);

    expect(renderer.root.findAllByType("a").map((item) => item.props.href)).toEqual([
      "/console",
      "/console/notifications",
      "/console/session-keys",
      "/",
    ]);

    const addService = renderer.root.findByType("button");
    await act(async () => addService.props.onClick());
    expect(onAddService).toHaveBeenCalledOnce();
  });

  it("continues loading service pages for the navigation", async () => {
    state.hasNextPage = true;

    await renderSidebar();

    expect(state.fetchNextPage).toHaveBeenCalledOnce();
  });
});
