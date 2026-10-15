// @vitest-environment jsdom
/** How a `?authorize=` link's request opens in the create dialog. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Hex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScopeId } from "@/utils/sessionKeys";
import { CreateKeyFlow } from "./CreateKeyFlow";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({
    children,
    variant,
    size,
    ...props
  }: React.ComponentProps<"button"> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogFooter: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/useContractTransaction", () => ({ useContractTransaction: () => ({ execute: vi.fn() }) }));
vi.mock("wagmi", () => ({ useReadContracts: () => ({ data: undefined }) }));

afterEach(cleanup);

const WARNING = "Requested by the link. Untick it unless this key should be able to do this.";

function renderRequest(prefillScopes: ScopeId[], extra: Partial<React.ComponentProps<typeof CreateKeyFlow>> = {}) {
  render(
    <CreateKeyFlow
      open
      onOpenChange={() => undefined}
      network='calibration'
      account={"0x00000000000000000000000000000000000000aa" as Hex}
      registry={{ address: "0x00000000000000000000000000000000000000cc" as Hex, abi: [] }}
      prefillAddress={"0x00000000000000000000000000000000000000bb" as Hex}
      prefillScopes={prefillScopes}
      onCreated={() => undefined}
      {...extra}
    />,
  );
}

const checkbox = (label: string) => screen.getByRole("checkbox", { name: new RegExp(`^${label}`) });

describe("CreateKeyFlow requested scopes", () => {
  it("ticks every requested scope and warns on the destructive one", () => {
    renderRequest(["createDataSet", "addPieces", "schedulePieceRemovals"]);

    expect(
      ["Create data set", "Add pieces", "Schedule piece removals", "Terminate service"].map((label) => ({
        label,
        checked: (checkbox(label) as HTMLInputElement).checked,
        disabled: (checkbox(label) as HTMLInputElement).disabled,
      })),
    ).toEqual([
      { label: "Create data set", checked: true, disabled: false },
      { label: "Add pieces", checked: true, disabled: false },
      { label: "Schedule piece removals", checked: true, disabled: false },
      { label: "Terminate service", checked: false, disabled: true },
    ]);
    expect(screen.getAllByText(WARNING)).toHaveLength(1);
    expect(screen.queryByText(/Granting fewer scopes than requested/)).toBeNull();
  });

  it("leaves a renewed key's destructive scope the link did not request unticked, without the warning", () => {
    renderRequest(["addPieces"], {
      existingKey: { name: "", scopes: ["addPieces", "terminateService"], expirySec: null },
    });

    const terminate = checkbox("Terminate service") as HTMLInputElement;
    expect({ checked: terminate.checked, disabled: terminate.disabled }).toEqual({ checked: false, disabled: false });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("drops the warning and flags the shortfall once the owner unticks it", () => {
    renderRequest(["createDataSet", "schedulePieceRemovals"]);

    fireEvent.click(checkbox("Schedule piece removals"));

    expect(screen.queryByText(WARNING)).toBeNull();
    expect(screen.getByText(/Granting fewer scopes than requested/)).not.toBeNull();
  });
});

describe("CreateKeyFlow requested name", () => {
  const nameInput = () => screen.getByRole("textbox", { name: /^Name/ }) as HTMLInputElement;

  it("prefills the name the link suggests, and lets the owner edit it", () => {
    renderRequest(["createDataSet"], { prefillName: "filecoin-cli" });

    expect(nameInput().value).toBe("filecoin-cli");
    expect(nameInput().disabled).toBe(false);
  });

  it("keeps an existing key's own name over the link's", () => {
    renderRequest(["createDataSet"], {
      prefillName: "filecoin-cli",
      existingKey: { name: "laptop", scopes: ["createDataSet"], expirySec: null },
    });

    expect(nameInput().value).toBe("laptop");
  });
});
