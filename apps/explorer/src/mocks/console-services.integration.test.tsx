import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WagmiProvider } from "wagmi";
import { initUIConfig } from "@/app/config-initializer";
import { ServiceDetail } from "@/components/UserConsole/ServiceDetail";
import { ServicesSection } from "@/components/UserConsole/ServicesSection";
import { NetworkContext } from "@/context/Network";
import { config } from "@/services/wagmi/config";

// The fixtures are read at module load, so the flag has to be set before the
// hooks are imported.
vi.mock("@/mocks/console-services", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./console-services")>()),
  MOCK_CONSOLE_SERVICES: true,
}));
// The shared barrel reaches the UI package's Navigation, whose extensionless
// `next/navigation` import does not resolve from its own directory under vitest.
vi.mock("@/components/shared", () => ({
  CopyableText: ({ value }: { value: string }) => <span>{value}</span>,
  InlineTextLoader: ({ text }: { text: string }) => <span>{text}</span>,
  RailStateBadge: ({ state }: { state: string }) => <span>{state}</span>,
}));
vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useBlockNumber: () => ({ data: 5_400_000n }),
}));

// `useGraphQLQuery` resolves the endpoint before it checks `enabled`, so the
// URLs must be set even though the fixtures mean no request is ever sent.
vi.stubEnv("NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION", "https://example.invalid/subgraph");
vi.stubEnv("NEXT_PUBLIC_SUBGRAPH_URL_MAINNET", "https://example.invalid/subgraph");

// The UI package's Button resolves its Link through this, as the app layout does.
initUIConfig();

const PAYER = "0x1111111111111111111111111111111111111111";
const WARM_STORAGE = "0x02925630df557f957f70e112ba06e50965417ca0";

const render = (ui: React.ReactNode) =>
  renderToStaticMarkup(
    <WagmiProvider config={config}>
      <QueryClientProvider client={new QueryClient()}>
        <NetworkContext.Provider value={{ network: "calibration" } as never}>{ui}</NetworkContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>,
  );

describe("console with fixtures enabled", () => {
  it("renders both fixture services on the console", () => {
    const markup = render(<ServicesSection accountId={PAYER} network='calibration' />);

    expect(markup).toContain("Filecoin Warm Storage Service");
    expect(markup).toContain("5 active / 12 total rails");
    expect(markup).toContain(`/console/services/${WARM_STORAGE}`);
    // The authorization-only service, named by its truncated address.
    expect(markup).toContain("0x7b3f4a1c9d2e8f6a5b4c3d2e1f0a9b8c7d6e5f40");
  });

  it("renders the service page with its pricing and a page of rails", () => {
    const markup = render(<ServiceDetail network='calibration' operatorAddress={WARM_STORAGE} userAddress={PAYER} />);

    expect(markup).toContain("Filecoin Warm Storage Service");
    expect(markup).toContain("2.5 USDFC");
    expect(markup).toContain("USDFC");
    // 12 rails over 10 per page means a second page button.
    expect(markup).toContain('aria-label="pagination"');
    expect(markup).toContain(">2<");
  });

  it("shows not found for an operator outside the fixtures", () => {
    const markup = render(
      <ServiceDetail
        network='calibration'
        operatorAddress='0x9999999999999999999999999999999999999999'
        userAddress={PAYER}
      />,
    );

    expect(markup).toContain("Service not found");
  });
});
