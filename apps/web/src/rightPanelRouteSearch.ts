import { TurnId } from "@t3tools/contracts";

export type RightPanelId = "diff" | "note";

export interface RightPanelRouteSearch {
  rightPanel?: RightPanelId | undefined;
  diffTurnId?: TurnId | undefined;
  diffFilePath?: string | undefined;
}

function isLegacyDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRightPanel(value: unknown): RightPanelId | undefined {
  if (value === "diff" || value === "note") {
    return value;
  }
  return undefined;
}

export function stripRightPanelSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "rightPanel" | "diff" | "diffTurnId" | "diffFilePath"> {
  const {
    rightPanel: _rightPanel,
    diff: _legacyDiff,
    diffTurnId: _diffTurnId,
    diffFilePath: _diffFilePath,
    ...rest
  } = params;
  return rest as Omit<T, "rightPanel" | "diff" | "diffTurnId" | "diffFilePath">;
}

export function setRightPanelRouteSearch<T extends Record<string, unknown>>(
  params: T,
  panel: RightPanelId,
  open: boolean,
): Omit<T, "rightPanel" | "diff" | "diffTurnId" | "diffFilePath"> & RightPanelRouteSearch {
  const rest = stripRightPanelSearchParams(params);
  if (!open) {
    return {
      ...rest,
      rightPanel: undefined,
    };
  }

  return {
    ...rest,
    rightPanel: panel,
  };
}

export function parseRightPanelRouteSearch(search: Record<string, unknown>): RightPanelRouteSearch {
  const rightPanel =
    normalizeRightPanel(search.rightPanel) ??
    (isLegacyDiffOpenValue(search.diff) ? "diff" : undefined);
  const diffTurnIdRaw =
    rightPanel === "diff" ? normalizeSearchString(search.diffTurnId) : undefined;
  const diffTurnId = diffTurnIdRaw ? TurnId.makeUnsafe(diffTurnIdRaw) : undefined;
  const diffFilePath =
    rightPanel === "diff" && diffTurnId ? normalizeSearchString(search.diffFilePath) : undefined;

  return {
    ...(rightPanel ? { rightPanel } : {}),
    ...(diffTurnId ? { diffTurnId } : {}),
    ...(diffFilePath ? { diffFilePath } : {}),
  };
}
