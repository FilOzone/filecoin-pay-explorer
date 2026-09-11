import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { RailsSearch } from "./RailsSearch";

// The UI package's Input is a Headless UI field that reaches for `document`,
// which the node test environment does not provide.
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: ({ onChange, ...rest }: { onChange: (value: string) => void }) => (
    <input {...rest} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const ADDRESS = "0x01d2a6dfa9ccbf4eefe50dfa5fd05341a0f74050";

const render = (appliedQuery = "") =>
  renderToStaticMarkup(<RailsSearch appliedQuery={appliedQuery} onSearch={vi.fn()} onClear={vi.fn()} />);

function mount(appliedQuery = "") {
  const onSearch = vi.fn();
  const onClear = vi.fn();
  let tree!: ReturnType<typeof create>;

  act(() => {
    tree = create(<RailsSearch appliedQuery={appliedQuery} onSearch={onSearch} onClear={onClear} />);
  });

  return { tree, onSearch, onClear };
}

const type = (tree: ReturnType<typeof create>, value: string) =>
  act(() => {
    tree.root.findByType("input").props.onChange({ target: { value } });
  });

const press = (tree: ReturnType<typeof create>, label: RegExp) =>
  act(() => {
    tree.root
      .findAll((node) => node.type === "button" && label.test(node.props["aria-label"] ?? ""))[0]
      .props.onClick();
  });

describe("RailsSearch", () => {
  it("submits through the icon, with no separate Search button", () => {
    const markup = render();

    expect(markup).toContain('aria-label="Search rails by rail ID or payee address"');
    expect(markup).not.toContain(">Search<");
  });

  it("disables the icon until the input can match exactly", () => {
    expect(render()).toContain("disabled");
  });

  it("shows no chip when nothing is applied", () => {
    expect(render()).not.toContain("Filtered by");
  });

  it("names an applied rail ID filter and offers to clear it", () => {
    const markup = render("27138");

    expect(markup).toContain("Filtered by");
    expect(markup).toContain("Rail ID");
    expect(markup).toContain("27138");
    expect(markup).toContain("Clear Rail ID filter");
  });

  it("names an applied payee filter with a truncated address", () => {
    const markup = render(ADDRESS);

    expect(markup).toContain("Payee");
    expect(markup).toContain("0x01d2...4050");
    expect(markup).toContain("Clear Payee filter");
  });

  it("passes the trimmed query up on search", () => {
    const { tree, onSearch } = mount();

    type(tree, `  ${ADDRESS} `);
    press(tree, /^Search rails/);

    expect(onSearch).toHaveBeenCalledWith(ADDRESS);
  });

  it("does not search a value that cannot match exactly", () => {
    const { tree, onSearch } = mount();

    type(tree, "0x8f1d");
    press(tree, /^Search rails/);

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("reports a cleared filter up and empties the draft", () => {
    const { tree, onClear } = mount("27138");

    type(tree, "999");
    press(tree, /^Clear Rail ID/);

    expect(onClear).toHaveBeenCalled();
    expect(tree.root.findByType("input").props.value).toBe("");
  });

  it("keeps the chip on the applied filter while the draft is edited", () => {
    const { tree } = mount("27138");

    type(tree, "999");

    expect(JSON.stringify(tree.toJSON())).toContain("27138");
  });
});
