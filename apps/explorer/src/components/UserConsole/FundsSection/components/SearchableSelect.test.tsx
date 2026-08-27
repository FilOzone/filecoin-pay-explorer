import { useState } from "react";
import { act, create } from "react-test-renderer";
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
  { aliases: ["USDC", "0x123"], detail: "1.25 USDC", label: "USDC (0x123…456)", value: "0x123" },
  { aliases: ["USDC", "0x789"], label: "USDC (0x789…abc)", value: "0x789" },
  { aliases: ["ETH", "0xeee"], label: "ETH (0xeee…eee)", value: "0xeee" },
];

function ControlledSearchableSelect() {
  const [network, setNetwork] = useState("base");
  const [value, setValue] = useState("");
  const scopedOptions = network === "base" ? options : [{ aliases: ["OP"], label: "OP (0xaaa…bbb)", value: "0xaaa" }];

  return (
    <>
      <button
        id='change-network'
        onClick={() => {
          setNetwork("optimism");
          setValue("");
        }}
        type='button'
      >
        Change network
      </button>
      <output>{value}</output>
      <SearchableSelect
        id='token'
        invalidMessage='Choose a token.'
        key={network}
        onValueChange={setValue}
        options={scopedOptions}
        placeholder='Search tokens'
        value={value}
      />
    </>
  );
}

describe("searchable option filtering", () => {
  it("filters by symbol or address and resolves only exact selections", () => {
    expect(filterSearchableOptions(options, "0x789")).toEqual([options[1]]);
    expect(filterSearchableOptions(options, "eth")).toEqual([options[2]]);
    expect(resolveSearchableOption(options, "eth")).toBe("0xeee");
    expect(resolveSearchableOption(options, "USDC")).toBe("");
  });
});

describe("SearchableSelect", () => {
  it("opens once on click without opening on focus", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ControlledSearchableSelect />);
    });

    const input = renderer.root.findByType("input");
    expect(input.props["aria-expanded"]).toBe(false);
    expect(input.props.onFocus).toBeUndefined();
    await act(async () => input.props.onClick());
    expect(input.props["aria-expanded"]).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain("1.25 USDC");
  });

  it("keeps the menu open while its scrollbar is used and handles wheel scrolling", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ControlledSearchableSelect />);
    });

    const input = renderer.root.findByType("input");
    await act(async () => input.props.onClick());
    await act(async () => input.props.onBlur());
    expect(input.props["aria-expanded"]).toBe(true);

    const stopPropagation = vi.fn();
    await act(async () =>
      renderer.root.findByProps({ "data-testid": "popover-content" }).props.onWheelCapture({ stopPropagation }),
    );
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("preserves replacement text and clears it when the option scope changes", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ControlledSearchableSelect />);
    });

    await act(async () => renderer.root.findAllByProps({ role: "option" })[2].props.onClick());
    expect(renderer.root.findByType("output").children).toEqual(["0xeee"]);

    await act(async () => renderer.root.findByType("input").props.onChange("U"));
    expect(renderer.root.findByType("input").props.value).toBe("U");
    expect(renderer.root.findByType("output").children).toEqual([]);

    await act(async () => renderer.root.findByProps({ id: "change-network" }).props.onClick());
    expect(renderer.root.findByType("input").props.value).toBe("");
    expect(renderer.root.findByType("output").children).toEqual([]);
  });

  it("supports keyboard selection and reports free text as invalid", async () => {
    const onValueChange = vi.fn();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <SearchableSelect
          id='token'
          invalidMessage='Choose a token.'
          onValueChange={onValueChange}
          options={options}
          placeholder='Search tokens'
          value=''
        />,
      );
    });
    const input = renderer.root.findByType("input");
    await act(async () => input.props.onChange("0x789"));
    await act(async () => input.props.onKeyDown({ key: "Enter", preventDefault: vi.fn() }));
    expect(onValueChange).toHaveBeenLastCalledWith("0x789");

    await act(async () => input.props.onChange("missing"));
    await act(async () => input.props.onBlur());
    expect(JSON.stringify(renderer.toJSON())).toContain("Choose a token.");
  });
});
