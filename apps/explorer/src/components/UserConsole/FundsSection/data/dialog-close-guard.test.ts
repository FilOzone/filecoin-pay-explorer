import { describe, expect, it, vi } from "vitest";
import { createDialogCloseGuard } from "./dialog-close-guard";

const toast = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

describe("createDialogCloseGuard", () => {
  it("opens freely, blocks closing with a message while busy, and closes otherwise", () => {
    let busy = true;
    const onClose = vi.fn();
    const onOpen = vi.fn();
    const handle = createDialogCloseGuard({ blockReason: () => (busy ? "Wait for it" : null), onClose, onOpen });

    handle(true);
    handle(false);
    expect({
      opens: onOpen.mock.calls.length,
      closes: onClose.mock.calls.length,
      toasts: toast.info.mock.calls,
    }).toEqual({
      opens: 1,
      closes: 0,
      toasts: [["Wait for it"]],
    });

    busy = false;
    handle(false);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
