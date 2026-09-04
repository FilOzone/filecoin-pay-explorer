import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ResponsiveTable } from "./ResponsiveTable";

describe("ResponsiveTable", () => {
  it("keeps the first column visible and does not show a scroll hint before overflow", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ResponsiveTable>
          <table>
            <tbody>
              <tr>
                <td>Rail #1</td>
              </tr>
            </tbody>
          </table>
        </ResponsiveTable>,
      );
    });

    const wrapper = renderer.root.findByProps({ "data-overflowing": false });
    expect(wrapper.props.className).toContain("[&_td:first-child]:sticky");
    expect(renderer.root.findAllByType("p")).toHaveLength(0);
    expect(renderer.root.findByType("td").children).toEqual(["Rail #1"]);
  });

  it("remeasures overflow and disconnects its observer", () => {
    const table = { scrollWidth: 401 };
    const container = { clientWidth: 300, querySelector: () => table };
    const disconnect = vi.fn();
    let remeasure = () => {};
    const OriginalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        remeasure = () => callback([], this);
      }
      disconnect = disconnect;
      observe = vi.fn();
      unobserve = vi.fn();
    };

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ResponsiveTable>
          <table />
        </ResponsiveTable>,
        { createNodeMock: (element) => (element.type === "table" ? table : container) },
      );
    });
    expect(renderer.root.findByProps({ "data-overflowing": true })).toBeDefined();
    expect(renderer.root.findByType("p").children).toEqual(["Scroll sideways to see the rest of the table."]);

    table.scrollWidth = 300;
    act(remeasure);
    expect(renderer.root.findByProps({ "data-overflowing": false })).toBeDefined();

    act(() => renderer.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    globalThis.ResizeObserver = OriginalResizeObserver;
  });
});
