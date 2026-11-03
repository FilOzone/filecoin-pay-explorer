// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CopyableText from "./CopyableText";

vi.mock("@/hooks/useNetwork", () => ({
  default: () => ({ network: "mainnet", setNetwork: vi.fn(), subgraphUrl: "" }),
}));
vi.mock("./CopyButton", () => ({ default: ({ value }: { value: string }) => <button type='button'>{value}</button> }));

const OPERATOR = "0x1234567890abcdef1234567890abcdef12345678";

afterEach(cleanup);

describe("CopyableText", () => {
  it("prefixes the link with the shared network context by default", () => {
    render(<CopyableText value={OPERATOR} to={`/accounts/${OPERATOR}`} />);

    expect(screen.getByRole("link").getAttribute("href")).toBe(`/mainnet/accounts/${OPERATOR}`);
  });

  it("prefixes the link with networkOverride when given, instead of the shared context", () => {
    render(<CopyableText value={OPERATOR} to={`/accounts/${OPERATOR}`} networkOverride='calibration' />);

    expect(screen.getByRole("link").getAttribute("href")).toBe(`/calibration/accounts/${OPERATOR}`);
  });

  it("shows children and title in place of the computed display and tooltip, and still copies the value", () => {
    render(
      <CopyableText value={OPERATOR} title='Custom tooltip'>
        <em>Custom</em>
      </CopyableText>,
    );

    const label = screen.getByText("Custom").closest("[title]");
    expect(label?.getAttribute("title")).toBe("Custom tooltip");
    expect(label?.textContent).toBe("Custom");
    expect(screen.getByRole("button").textContent).toBe(OPERATOR);
  });
});
