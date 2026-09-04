import { useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { filterSearchableOptions, resolveSearchableOption, SearchableSelect } from "./SearchableSelect";

vi.mock("@filecoin-pay/ui/components/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => children,
  PopoverAnchor: ({ children }: { children: React.ReactNode }) => children,
  PopoverContent: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div data-testid='popover-content' {...props}>
      {children}
    </div>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

const options = [
  { aliases: ["USDC", "0x123"], detail: "1.25 USDC", label: "USDC", value: "0x123" },
  { aliases: ["ETH", "0xeee"], detail: "0 ETH", label: "ETH", value: "0xeee" },
];

function Harness() {
  const [value, setValue] = useState("");
  const [reversed, setReversed] = useState(false);
  return (
    <>
      <button id='select-eth' onClick={() => setValue("0xeee")} type='button'>
        Select ETH
      </button>
      <button id='reverse' onClick={() => setReversed(true)} type='button'>
        Reverse
      </button>
      <output>{value}</output>
      <SearchableSelect
        id='token'
        invalidMessage='Choose a token.'
        onValueChange={setValue}
        options={reversed ? [...options].reverse() : options}
        placeholder='Search tokens'
        value={value}
      />
    </>
  );
}

const text = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : text(child))).join("");

describe("searchable option filtering", () => {
  it("filters by symbol or address and resolves only unambiguous exact selections", () => {
    expect(filterSearchableOptions(options, "0xeee")).toEqual([options[1]]);
    expect(resolveSearchableOption(options, "eth")).toBe("0xeee");
    expect(resolveSearchableOption([...options, { ...options[0], value: "0x789" }], "USDC")).toBe("");
  });
});

describe("SearchableSelect", () => {
  it("freezes option order while open and uses refreshed options after reopening", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Harness />);
    });
    const input = renderer.root.findByType("input");
    await act(async () => input.props.onClick());
    expect(text(renderer.root.findAllByProps({ role: "option" })[0])).toContain("USDC");

    await act(async () => renderer.root.findByProps({ id: "reverse" }).props.onClick());
    expect(text(renderer.root.findAllByProps({ role: "option" })[0])).toContain("USDC");
    await act(async () => input.props.onClick());
    expect(text(renderer.root.findAllByProps({ role: "option" })[0])).toContain("USDC");

    await act(async () => input.props.onKeyDown({ key: "Escape" }));
    await act(async () => input.props.onClick());
    expect(text(renderer.root.findAllByProps({ role: "option" })[0])).toContain("ETH");
  });

  it("syncs an externally selected label while closed and supports keyboard selection", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Harness />);
    });
    await act(async () => renderer.root.findByProps({ id: "select-eth" }).props.onClick());
    expect(renderer.root.findByType("input").props.value).toBe("ETH");

    const input = renderer.root.findByType("input");
    await act(async () => input.props.onChange("USDC"));
    await act(async () => input.props.onKeyDown({ key: "Enter", preventDefault: vi.fn() }));
    expect(renderer.root.findByType("output").children).toEqual(["0x123"]);
  });

  it("opens ArrowDown on the first option without exposing a missing active descendant", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Harness />);
    });
    const input = renderer.root.findByType("input");
    await act(async () => input.props.onKeyDown({ key: "ArrowDown", preventDefault: vi.fn() }));
    expect(renderer.root.findByType("input").props["aria-activedescendant"]).toMatch(/-0$/);
    await act(async () => renderer.root.findByType("input").props.onKeyDown({ key: "Enter", preventDefault: vi.fn() }));
    expect(renderer.root.findByType("output").children).toEqual(["0x123"]);
  });

  it("reports unmatched free text and keeps portalled wheel events local", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Harness />);
    });
    const input = renderer.root.findByType("input");
    await act(async () => input.props.onChange("missing"));
    await act(async () => input.props.onBlur());
    expect(JSON.stringify(renderer.toJSON())).toContain("Choose a token.");

    const stopPropagation = vi.fn();
    await act(async () =>
      renderer.root.findByProps({ "data-testid": "popover-content" }).props.onWheelCapture({ stopPropagation }),
    );
    expect(stopPropagation).toHaveBeenCalledOnce();
  });
});
