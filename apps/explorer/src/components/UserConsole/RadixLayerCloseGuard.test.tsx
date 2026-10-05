import { useRadixLayerCloseGuard } from "@filecoin-pay/ui/hooks/use-radix-layer-close-guard";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: React act environment flag
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = () => void;

describe("useRadixLayerCloseGuard", () => {
  const listeners = new Map<string, Listener>();
  const body = { style: { pointerEvents: "" } };
  const onClose = vi.fn();
  let close: () => void;

  const Harness = () => {
    close = useRadixLayerCloseGuard(onClose);
    return null;
  };

  const fire = (type: string) => listeners.get(type)?.();

  beforeEach(() => {
    vi.useFakeTimers();
    body.style.pointerEvents = "";
    listeners.clear();
    vi.stubGlobal("document", {
      body,
      addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    act(() => {
      create(<Harness />);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("closes on a press outside any Radix layer", () => {
    fire("pointerdown");
    close();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("drops the close for a press made while a Radix layer blocks pointer events", () => {
    body.style.pointerEvents = "none";
    fire("pointerdown");
    body.style.pointerEvents = ""; // Radix restores it as it closes the layer
    close();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes again on the next press once the layer is gone", () => {
    body.style.pointerEvents = "none";
    fire("pointerdown");
    fire("pointerup");
    vi.runAllTimers();
    body.style.pointerEvents = "";
    fire("pointerdown");
    close();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
