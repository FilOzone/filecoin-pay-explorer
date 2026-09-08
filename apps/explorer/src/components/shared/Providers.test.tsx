import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { TOAST_OPTIONS } from "@/utils/toast";
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

describe("Providers", () => {
  it("configures the toaster with the shared toast options", () => {
    act(() => {
      create(
        <Providers>
          <span>page</span>
        </Providers>,
      );
    });

    expect(toaster.props).toEqual({ position: "top-right", toastOptions: TOAST_OPTIONS });
  });
});
