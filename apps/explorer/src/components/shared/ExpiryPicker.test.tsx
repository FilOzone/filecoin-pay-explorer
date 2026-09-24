import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpiryPicker } from "./ExpiryPicker";

const render = (presetIndex: string) =>
  renderToStaticMarkup(
    <ExpiryPicker
      id='expiry'
      presets={[
        { label: "30 days", seconds: 30 * 86_400 },
        { label: "90 days", seconds: 90 * 86_400 },
      ]}
      presetIndex={presetIndex}
      customDate=''
      onPresetIndexChange={() => {}}
      onCustomDateChange={() => {}}
      customDateLabel='Until'
      customDateRange={{ min: "2026-09-24", max: "2027-09-24" }}
    />,
  );

describe("ExpiryPicker", () => {
  it("lists the presets plus a custom option, without a date input", () => {
    const markup = render("0");
    expect(markup).toContain(">30 days</option>");
    expect(markup).toContain(">90 days</option>");
    expect(markup).toContain(">Custom date…</option>");
    expect(markup).not.toContain('type="date"');
  });

  it("shows a bounded date input for a custom date", () => {
    const markup = render("custom");
    expect(markup).toContain('type="date"');
    expect(markup).toContain('min="2026-09-24"');
    expect(markup).toContain('max="2027-09-24"');
  });
});
