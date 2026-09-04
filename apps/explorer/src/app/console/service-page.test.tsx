import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServicePage from "./(console)/services/[operator]/page";

const route = vi.hoisted(() => ({
  operator: "",
  address: undefined as string | undefined,
  chainId: 314 as number | undefined,
}));

const observed = vi.hoisted(() => ({ detailProps: {} as Record<string, unknown> }));

vi.mock("next/navigation", () => ({ useParams: () => ({ operator: route.operator }) }));
vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useConnection: () => ({ address: route.address, chainId: route.chainId }),
}));
vi.mock("@/components/UserConsole/ServiceDetail", () => ({
  ServiceDetail: (props: Record<string, unknown>) => {
    observed.detailProps = props;
    return <div>Service detail</div>;
  },
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, href }: { children: React.ReactNode; href?: string }) => <a href={href}>{children}</a>,
}));
// The shared barrel reaches the UI package's Navigation, which cannot resolve
// `next/navigation` from its own directory once that module is mocked here.
vi.mock("@/components/shared", () => ({
  CopyableText: ({ value }: { value: string }) => <span>{value}</span>,
}));

const WARM_STORAGE = "0x02925630df557f957f70e112ba06e50965417ca0";
const WALLET = "0xAbC1111111111111111111111111111111111111";

describe("ServicePage", () => {
  beforeEach(() => {
    route.operator = WARM_STORAGE;
    route.address = WALLET;
    route.chainId = 314;
    observed.detailProps = {};
  });

  it("passes the operator segment and the connected wallet to the detail view", () => {
    expect(renderToStaticMarkup(<ServicePage />)).toContain("Service detail");
    expect(observed.detailProps).toMatchObject({
      network: "mainnet",
      operatorAddress: WARM_STORAGE,
      userAddress: WALLET,
    });
  });

  it("resolves the network from the connected chain", () => {
    route.chainId = 314159;

    renderToStaticMarkup(<ServicePage />);

    expect(observed.detailProps.network).toBe("calibration");
  });

  it.each([
    "not-an-address",
    "0x1234",
    `${WARM_STORAGE}00`,
  ])("shows the not-found state for the segment %s", (operator) => {
    route.operator = operator;

    const markup = renderToStaticMarkup(<ServicePage />);

    expect(markup).toContain("Service not found");
    expect(markup).not.toContain("Service detail");
  });
});
