import { describe, expect, it } from "vitest";

import { parseRightPanelRouteSearch, setRightPanelRouteSearch } from "./rightPanelRouteSearch";

describe("parseRightPanelRouteSearch", () => {
  it("parses note panel state", () => {
    expect(
      parseRightPanelRouteSearch({
        rightPanel: "note",
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      rightPanel: "note",
    });
  });

  it("parses diff panel state with diff selection", () => {
    expect(
      parseRightPanelRouteSearch({
        rightPanel: "diff",
        diffTurnId: "turn-1",
        diffFilePath: "src/app.ts",
      }),
    ).toEqual({
      rightPanel: "diff",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });
  });

  it("treats legacy diff search values as the diff panel", () => {
    expect(
      parseRightPanelRouteSearch({
        diff: true,
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      rightPanel: "diff",
      diffTurnId: "turn-1",
    });
  });

  it("drops diff selection when the active panel is not diff", () => {
    expect(
      parseRightPanelRouteSearch({
        rightPanel: "note",
        diffTurnId: "turn-1",
        diffFilePath: "src/app.ts",
      }),
    ).toEqual({
      rightPanel: "note",
    });
  });

  it("drops diff file path when no diff turn is selected", () => {
    expect(
      parseRightPanelRouteSearch({
        rightPanel: "diff",
        diffFilePath: "src/app.ts",
      }),
    ).toEqual({
      rightPanel: "diff",
    });
  });
});

describe("setRightPanelRouteSearch", () => {
  it("opens the requested panel and strips diff-only state", () => {
    expect(
      setRightPanelRouteSearch(
        {
          foo: "bar",
          rightPanel: "diff",
          diffTurnId: "turn-1",
          diffFilePath: "src/app.ts",
        },
        "note",
        true,
      ),
    ).toEqual({
      foo: "bar",
      rightPanel: "note",
    });
  });

  it("closes the panel and explicitly clears the retained right-panel state", () => {
    const result = setRightPanelRouteSearch(
      {
        foo: "bar",
        rightPanel: "note",
        diffTurnId: "turn-1",
      },
      "note",
      false,
    );

    expect(result.foo).toBe("bar");
    expect("rightPanel" in result).toBe(true);
    expect(result.rightPanel).toBeUndefined();
    expect("diffTurnId" in result).toBe(false);
  });
});
