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
});
