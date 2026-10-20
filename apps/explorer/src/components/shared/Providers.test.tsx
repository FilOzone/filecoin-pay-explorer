// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Providers from "./Providers";

const toaster = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock("@filecoin-pay/ui/components/sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    toaster.props = props;
    return null;
  },
}));
vi.mock("@filecoin-pay/ui/components/progress-bar", () => ({ ProgressBar: () => null }));
vi.mock("@filecoin-pay/ui/components/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/app/config-initializer", () => ({ initUIConfig: vi.fn() }));
vi.mock("@/context/Network", () => ({
  NetworkProvider: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(cleanup);

describe("Providers", () => {
  it("keeps the toaster on the app's light theme", () => {
    render(
      <Providers>
        <span>page</span>
      </Providers>,
    );

    expect(toaster.props).toMatchObject({ theme: "light", position: "top-right" });
  });
});
