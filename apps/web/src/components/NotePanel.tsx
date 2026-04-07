import { ThreadId, type ProjectId } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { newCommandId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useProjectById, useThreadById } from "../storeSelectors";
import { useStore } from "../store";
import { DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";
import { toastManager } from "./ui/toast";

type NoteSaveStatus = "saved" | "saving" | "error";

const NOTE_SAVE_DEBOUNCE_MS = 750;

interface NotePanelProps {
  mode?: DiffPanelMode;
}

export default function NotePanel({ mode = "inline" }: NotePanelProps) {
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const activeThread = useThreadById(routeThreadId);
  const draftThread = useComposerDraftStore((store) =>
    routeThreadId ? (store.draftThreadsByThreadId[routeThreadId] ?? null) : null,
  );
  const activeProject = useProjectById(activeThread?.projectId ?? draftThread?.projectId);
  const [draftNotesByProjectId, setDraftNotesByProjectId] = useState<Record<string, string>>({});
  const [saveStatusByProjectId, setSaveStatusByProjectId] = useState<
    Record<string, NoteSaveStatus>
  >({});
  const draftNotesRef = useRef<Record<string, string>>({});
  const dirtyProjectIdsRef = useRef<Record<string, boolean>>({});
  const saveTimeoutByProjectIdRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const previousProjectIdRef = useRef<ProjectId | null>(null);
  const latestSaveRequestIdByProjectIdRef = useRef(new Map<string, number>());
  const saveRequestSequenceRef = useRef(0);

  const setProjectDraft = (projectId: ProjectId, note: string) => {
    draftNotesRef.current[projectId] = note;
    setDraftNotesByProjectId((previous) =>
      previous[projectId] === note ? previous : { ...previous, [projectId]: note },
    );
  };

  const setProjectSaveStatus = (projectId: ProjectId, status: NoteSaveStatus) => {
    setSaveStatusByProjectId((previous) =>
      previous[projectId] === status ? previous : { ...previous, [projectId]: status },
    );
  };

  const setProjectDirty = (projectId: ProjectId, dirty: boolean) => {
    dirtyProjectIdsRef.current[projectId] = dirty;
  };

  const clearScheduledSave = (projectId: ProjectId) => {
    const timeoutId = saveTimeoutByProjectIdRef.current.get(projectId);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      saveTimeoutByProjectIdRef.current.delete(projectId);
    }
  };

  const commitProjectNote = useEffectEvent(async (projectId: ProjectId, note: string) => {
    clearScheduledSave(projectId);
    const persistedProject = useStore
      .getState()
      .projects.find((project) => project.id === projectId);
    if (persistedProject?.note === note) {
      setProjectDirty(projectId, false);
      setProjectSaveStatus(projectId, "saved");
      return;
    }

    const api = readNativeApi();
    if (!api) {
      setProjectSaveStatus(projectId, "error");
      toastManager.add({
        type: "error",
        title: "Could not save notes",
        description: "The native API is unavailable.",
      });
      return;
    }

    setProjectSaveStatus(projectId, "saving");
    const requestId = ++saveRequestSequenceRef.current;
    latestSaveRequestIdByProjectIdRef.current.set(projectId, requestId);

    try {
      await api.orchestration.dispatchCommand({
        type: "project.meta.update",
        commandId: newCommandId(),
        projectId,
        note,
      });

      if (latestSaveRequestIdByProjectIdRef.current.get(projectId) !== requestId) {
        return;
      }

      if ((draftNotesRef.current[projectId] ?? note) === note) {
        setProjectDirty(projectId, false);
        setProjectSaveStatus(projectId, "saved");
      }
    } catch (error) {
      if (latestSaveRequestIdByProjectIdRef.current.get(projectId) !== requestId) {
        return;
      }

      setProjectSaveStatus(projectId, "error");
      toastManager.add({
        type: "error",
        title: "Could not save notes",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  });

  const scheduleProjectSave = useEffectEvent((projectId: ProjectId, note: string) => {
    clearScheduledSave(projectId);
    saveTimeoutByProjectIdRef.current.set(
      projectId,
      setTimeout(() => {
        void commitProjectNote(projectId, note);
      }, NOTE_SAVE_DEBOUNCE_MS),
    );
  });

  const flushProjectSave = useEffectEvent((projectId: ProjectId | null) => {
    if (!projectId || !dirtyProjectIdsRef.current[projectId]) {
      return;
    }
    clearScheduledSave(projectId);
    void commitProjectNote(projectId, draftNotesRef.current[projectId] ?? "");
  });

  useEffect(() => {
    const previousProjectId = previousProjectIdRef.current;
    if (previousProjectId !== null && previousProjectId !== activeProject?.id) {
      flushProjectSave(previousProjectId);
    }
    previousProjectIdRef.current = activeProject?.id ?? null;
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject || dirtyProjectIdsRef.current[activeProject.id]) {
      return;
    }

    setProjectDraft(activeProject.id, activeProject.note);
    setProjectSaveStatus(activeProject.id, "saved");
  }, [activeProject]);

  useEffect(() => {
    const dirtyProjectIds = dirtyProjectIdsRef.current;

    return () => {
      for (const [projectId, isDirty] of Object.entries(dirtyProjectIds)) {
        if (isDirty) {
          flushProjectSave(projectId as ProjectId);
        }
      }
    };
  }, []);

  const activeProjectId = activeProject?.id ?? null;
  const activeNote =
    activeProjectId === null
      ? ""
      : (draftNotesByProjectId[activeProjectId] ?? activeProject?.note ?? "");
  const activeSaveStatus =
    activeProjectId === null ? "saved" : (saveStatusByProjectId[activeProjectId] ?? "saved");
  const activeSaveStatusLabel =
    activeSaveStatus === "error"
      ? "Save failed"
      : activeSaveStatus === "saving"
        ? "Saving..."
        : "Saved";

  const handleNoteChange = (nextValue: string) => {
    if (!activeProject) {
      return;
    }

    setProjectDraft(activeProject.id, nextValue);
    const isDirty = nextValue !== activeProject.note;
    setProjectDirty(activeProject.id, isDirty);

    if (!isDirty) {
      clearScheduledSave(activeProject.id);
      setProjectSaveStatus(activeProject.id, "saved");
      return;
    }

    setProjectSaveStatus(activeProject.id, "saving");
    scheduleProjectSave(activeProject.id, nextValue);
  };

  const header = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="text-sm font-medium text-foreground">Notes</span>
      {activeProject ? (
        <span className="text-xs text-muted-foreground">{activeSaveStatusLabel}</span>
      ) : null}
    </div>
  );

  return (
    <DiffPanelShell mode={mode} header={header}>
      {!activeProject ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Notes are unavailable until this thread has an active project.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <textarea
            value={activeNote}
            onChange={(event) => handleNoteChange(event.target.value)}
            onBlur={() => flushProjectSave(activeProject.id)}
            spellCheck={false}
            aria-label="Project notes"
            placeholder={"Write project notes here.\n\nSupports plain text or Markdown."}
            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      )}
    </DiffPanelShell>
  );
}
