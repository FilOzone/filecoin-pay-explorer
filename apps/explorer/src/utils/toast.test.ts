import { describe, expect, it } from "vitest";
import { getToastContent, TOAST_OPTIONS } from "./toast";

describe("TOAST_OPTIONS", () => {
  it("binds the description to the same text token as the title, over sonner's own colour", () => {
    expect(TOAST_OPTIONS).toEqual({
      classNames: { description: "text-(--normal-text)! opacity-80" },
      style: {
        "--normal-bg": "var(--color-card-background-hover)",
        "--normal-text": "var(--color-text-base)",
        "--normal-border": "var(--color-border-base)",
        "--border-radius": "var(--radius)",
      },
    });
  });
});

describe("getToastContent", () => {
  it("describes a withdrawal at each stage", () => {
    const metadata = { type: "withdraw" as const, amount: "0.01", token: "USDFC" };
    expect(getToastContent(metadata, "pending")).toEqual({
      title: "Processing Withdrawal",
      description: "Withdrawing 0.01 USDFC...",
    });
    expect(getToastContent(metadata, "success")).toEqual({
      title: "Withdrawal Complete",
      description: "0.01 USDFC withdrawn",
    });
  });
});
