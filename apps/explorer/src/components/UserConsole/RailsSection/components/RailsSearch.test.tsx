import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RailsSearch } from "./RailsSearch";

const render = () => renderToStaticMarkup(<RailsSearch onSearch={vi.fn()} onClear={vi.fn()} />);

describe("RailsSearch", () => {
  it("submits through the icon, with no separate Search button", () => {
    const markup = render();

    expect(markup).toContain('aria-label="Search rails by ID"');
    expect(markup).not.toContain(">Search<");
  });

  it("disables the icon until something is typed", () => {
    expect(render()).toContain("disabled");
  });

  it("keeps the icon inside the field, on the right", () => {
    const markup = render();

    expect(markup).toContain("right-2");
    expect(markup).not.toContain("left-3");
  });

  it("leaves room for the icon and trims the field height", () => {
    const markup = render();

    expect(markup).toContain("pr-10");
    expect(markup).toContain("py-2");
  });

  it("offers Clear only after a search has run", () => {
    expect(render()).not.toContain("Clear");
  });
});
