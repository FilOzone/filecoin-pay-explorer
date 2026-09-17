import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ServiceDetail } from ".";

vi.mock("@/hooks/useAccountServices", () => ({
  useAccountService: () => ({ data: null, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useServiceProfiles", () => ({
  useServiceProfiles: () => vi.fn(),
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

const PAYER = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";

describe("ServiceDetail", () => {
  it("shows not found when the payer has no relationship with the operator", () => {
    const markup = renderToStaticMarkup(
      <ServiceDetail network='mainnet' operatorAddress={OPERATOR} userAddress={PAYER} />,
    );

    expect(markup).toContain("Service not found");
    expect(markup).not.toContain("Payment rails");
  });
});
