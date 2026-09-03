import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ResponsiveTable } from "./ResponsiveTable";

describe("ResponsiveTable", () => {
  it("renders its table with a sticky first column and no hint until it overflows", () => {
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
});
