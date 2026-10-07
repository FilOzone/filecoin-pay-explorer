import { useEffect, useRef } from "react";

/**
 * Headless UI closes a dialog when a pointer press lands outside its panel. While a modal Radix
 * layer (Select, DropdownMenu) is open it sets `body { pointer-events: none }`, so a press inside
 * the panel hit-tests to <body> and Headless UI reads it as outside, closing the whole dialog
 * instead of just the layer. Radix has already closed the layer on that same press, so the close
 * is dropped.
 */
export function useRadixLayerCloseGuard(onClose: () => void) {
  const pressedUnderRadixLayer = useRef(false);

  useEffect(() => {
    const onPointerDown = () => {
      pressedUnderRadixLayer.current = document.body.style.pointerEvents === "none";
    };
    // Headless UI decides on pointerup, so clear the flag only after that has run.
    const onPointerUp = () => setTimeout(() => (pressedUnderRadixLayer.current = false));
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
    };
  }, []);

  return () => {
    if (!pressedUnderRadixLayer.current) onClose();
  };
}
