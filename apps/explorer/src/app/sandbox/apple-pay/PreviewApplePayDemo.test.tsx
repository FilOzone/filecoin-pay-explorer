// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreviewApplePayDemo from "./PreviewApplePayDemo";

const address = "0x0000000000000000000000000000000000000001";
const otherWallet = "0x0000000000000000000000000000000000000002";
const request = vi.fn();

function advance(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Filecoin Pay preview walkthrough", () => {
  it("shows example receipt terms before approval and progresses to a separate deposit confirmation without a checkout or network call", () => {
    render(<PreviewApplePayDemo address={address} example />);
    expect(screen.getByText("$0")).toBeTruthy();
    for (const amount of ["$5.00", "$0.10", "4.90 USDC", "4.0875", "0.05 FIL"])
      expect(screen.getByText(amount)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to console" }).getAttribute("href")).toBe("/console");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    advance("Simulate $5 payment approval");
    expect(screen.getByRole("heading", { name: "Demo payment approved" })).toBeTruthy();
    expect(screen.queryByText("Demo deposit confirmed")).toBeNull();
    advance("Approve simulated conversion");
    expect(screen.getByRole("heading", { name: "Demo conversion in progress" })).toBeTruthy();
    advance("Show deposit confirmation");
    expect(screen.getByRole("heading", { name: "Demo deposit confirmed" })).toBeTruthy();
    advance("Restart walkthrough");
    expect(screen.getByRole("button", { name: "Simulate $5 payment approval" })).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it("restores progress for the same wallet after a refresh and starts other wallets at review", () => {
    const first = render(<PreviewApplePayDemo address={address} example={false} />);
    advance("Simulate $5 payment approval");
    first.unmount();
    const next = render(<PreviewApplePayDemo address={otherWallet} example={false} />);
    expect(screen.getByRole("heading", { name: "Review the example purchase" })).toBeTruthy();
    next.rerender(<PreviewApplePayDemo address={address} example={false} />);
    expect(screen.getByRole("heading", { name: "Demo payment approved" })).toBeTruthy();
    advance("Approve simulated conversion");
    next.unmount();
    render(<PreviewApplePayDemo address={address} example={false} />);
    expect(screen.getByRole("button", { name: "Show deposit confirmation" })).toBeTruthy();
  });

  it("keeps the walkthrough usable when tab storage is unavailable", () => {
    const unavailable = () => {
      throw new Error("Storage disabled");
    };
    vi.stubGlobal("sessionStorage", { getItem: unavailable, setItem: unavailable });
    render(<PreviewApplePayDemo address={address} example />);
    advance("Simulate $5 payment approval");
    expect(screen.getByRole("status").textContent).toMatch(/refreshing will restart/i);
    expect(screen.getByRole("button", { name: "Approve simulated conversion" })).toBeTruthy();
  });
});
