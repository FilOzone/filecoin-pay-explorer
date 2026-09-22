import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CopyableText from "./CopyableText";

vi.mock("@/hooks/useNetwork", () => ({
  default: () => ({ network: "mainnet", setNetwork: vi.fn(), subgraphUrl: "" }),
}));

const ADDRESS = "0x1111111111111111111111111111111111111111";

describe("CopyableText", () => {
  it("prefixes the link with the shared network context by default", () => {
    const markup = renderToStaticMarkup(<CopyableText value={ADDRESS} to={`/accounts/${ADDRESS}`} />);

    expect(markup).toContain(`href="/mainnet/accounts/${ADDRESS}"`);
  });

  it("prefixes the link with networkOverride when given, instead of the shared context", () => {
    const markup = renderToStaticMarkup(
      <CopyableText value={ADDRESS} to={`/accounts/${ADDRESS}`} networkOverride='calibration' />,
    );

    expect(markup).toContain(`href="/calibration/accounts/${ADDRESS}"`);
    expect(markup).not.toContain(`href="/mainnet/accounts/${ADDRESS}"`);
  });
});
