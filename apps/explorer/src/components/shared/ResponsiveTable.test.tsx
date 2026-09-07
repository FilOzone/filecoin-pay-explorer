import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResponsiveTable } from "./ResponsiveTable";

const hint = (renderer: ReturnType<typeof create>) => renderer.root.findAllByType("p").map((p) => p.children.join(""));
const fade = (renderer: ReturnType<typeof create>) => renderer.root.findAllByProps({ "aria-hidden": true });

describe("ResponsiveTable", () => {
  const OriginalResizeObserver = globalThis.ResizeObserver;
  afterEach(() => {
    globalThis.ResizeObserver = OriginalResizeObserver;
  });

  it("renders the table unchanged with no hint or fade before overflow", () => {
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

    expect(renderer.root.findByType("td").children).toEqual(["Rail #1"]);
    expect(hint(renderer)).toEqual([]);
    expect(fade(renderer)).toEqual([]);
  });

  it("hints and fades while columns remain off-screen, then follows scrolling and resizing", () => {
    const scroller = {
      clientWidth: 300,
      scrollLeft: 0,
      scrollWidth: 401,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const table = { parentElement: scroller, scrollWidth: 401 };
    const container = { clientWidth: 300, querySelector: () => table };
    const disconnect = vi.fn();
    let remeasure = () => {};
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
    expect(hint(renderer)).toEqual(["Scroll sideways to see the rest of the table."]);
    expect(fade(renderer)).toHaveLength(1);

    const [, onScroll] = scroller.addEventListener.mock.calls[0] as [string, () => void];
    scroller.scrollLeft = 101;
    act(onScroll);
    expect(fade(renderer)).toEqual([]);
    expect(hint(renderer)).toHaveLength(1);

    table.scrollWidth = 300;
    scroller.scrollWidth = 300;
    act(remeasure);
    expect(hint(renderer)).toEqual([]);

    act(() => renderer.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    expect(scroller.removeEventListener).toHaveBeenCalledWith("scroll", onScroll);
  });
});
