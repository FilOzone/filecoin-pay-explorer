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
// The real Input hands onChange the value, not the event.
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: ({
    onChange,
    ...props
  }: Omit<React.ComponentProps<"input">, "onChange"> & { onChange: (v: string) => void }) => (
    <input {...props} onChange={(e) => onChange(e.target.value)} />
  ),
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

type Extra = Partial<React.ComponentProps<typeof CreateKeyFlow>>;

const request = (prefillScopes: ScopeId[], extra: Extra = {}) => (
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
  />
);

const renderRequest = (prefillScopes: ScopeId[], extra: Extra = {}) => render(request(prefillScopes, extra));

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
    expect(screen.getByText("This key held it before. Check to renew it too.")).not.toBeNull();
    expect(screen.getByText(/Its previous scopes are checked again, except destructive ones/)).not.toBeNull();
  });

  it("keeps what the owner changed when the key becomes known while the form is open", () => {
    const { rerender } = renderRequest(["createDataSet", "addPieces"]);
    fireEvent.click(checkbox("Add pieces"));

    // A chain sync imports the key: the parent now passes it as an existing key.
    rerender(
      request(["createDataSet", "addPieces"], {
        existingKey: { name: "laptop", scopes: ["createDataSet"], expirySec: null },
      }),
    );

    expect((checkbox("Add pieces") as HTMLInputElement).checked).toBe(false);
  });

  it("drops the warning and flags the shortfall once the owner unticks it", () => {
    renderRequest(["createDataSet", "schedulePieceRemovals"]);

    fireEvent.click(checkbox("Schedule piece removals"));

    expect(screen.queryByText(WARNING)).toBeNull();
    expect(screen.getByText(/Granting fewer scopes than requested/)).not.toBeNull();
  });
});

describe("CreateKeyFlow expiry in days", () => {
  const daysInput = () => screen.getByRole("textbox", { name: /^Expiration/ }) as HTMLInputElement;

  it("defaults to 30 days, or the days the link suggests, and stays editable", () => {
    renderRequest(["createDataSet"], { prefillDays: 7 });
    expect({ value: daysInput().value, disabled: daysInput().disabled }).toEqual({ value: "7", disabled: false });
    cleanup();

    renderRequest(["createDataSet"]);
    expect(daysInput().value).toBe("30");
  });

  it("holds Authorize when the days land past the last date a JS Date holds", () => {
    renderRequest(["createDataSet"]);

    fireEvent.change(daysInput(), { target: { value: "100000000" } });

    expect(screen.getByText(/^Enter a whole number of days, at least 1, ending by/)).not.toBeNull();
    expect((screen.getByRole("button", { name: /^Authorize as / }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses what a number input would take as valid, like 1e2 or 7.0, and says why", () => {
    renderRequest(["createDataSet"]);

    for (const value of ["1e2", "7.0"]) {
      fireEvent.change(daysInput(), { target: { value } });
      expect(screen.getByText(/^Enter a whole number of days, at least 1, ending by/)).not.toBeNull();
    }
    expect(daysInput().getAttribute("inputmode")).toBe("numeric");
  });

  it("marks the field invalid and points it at the message that says why", () => {
    renderRequest(["createDataSet"]);
    const hint = () => document.getElementById(daysInput().getAttribute("aria-describedby") ?? "");

    expect(daysInput().getAttribute("aria-invalid")).toBe("false");
    expect(hint()?.textContent).toMatch(/^The key stops working on /);

    fireEvent.change(daysInput(), { target: { value: "0" } });

    expect(daysInput().getAttribute("aria-invalid")).toBe("true");
    expect(hint()?.textContent).toMatch(/^Enter a whole number of days, at least 1, ending by/);
  });

  it("holds Authorize and says why when the days are unusable", () => {
    renderRequest(["createDataSet"]);

    fireEvent.change(daysInput(), { target: { value: "0" } });

    expect(screen.getByText(/^Enter a whole number of days, at least 1, ending by/)).not.toBeNull();
    expect((screen.getByRole("button", { name: /^Authorize as / }) as HTMLButtonElement).disabled).toBe(true);
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

  it("fills in the link's name when the existing key has none", () => {
    renderRequest(["createDataSet"], {
      prefillName: "filecoin-cli",
      existingKey: { name: "", scopes: ["createDataSet"], expirySec: null },
    });

    expect(nameInput().value).toBe("filecoin-cli");
  });

  it("keeps a name the owner typed when the key becomes known while the form is open", () => {
    const { rerender } = renderRequest(["createDataSet"], { prefillName: "filecoin-cli" });
    fireEvent.change(nameInput(), { target: { value: "my laptop" } });

    rerender(
      request(["createDataSet"], {
        prefillName: "filecoin-cli",
        existingKey: { name: "laptop", scopes: ["createDataSet"], expirySec: null },
      }),
    );

    expect(nameInput().value).toBe("my laptop");
  });
});
