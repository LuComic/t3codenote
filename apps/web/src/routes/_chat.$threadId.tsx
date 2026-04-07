import { ThreadId } from "@t3tools/contracts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import {
  Suspense,
  lazy,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

import ChatView from "../components/ChatView";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "../components/ui/sidebar";
import { useComposerDraftStore } from "../composerDraftStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  type RightPanelId,
  type RightPanelRouteSearch,
  parseRightPanelRouteSearch,
  setRightPanelRouteSearch,
} from "../rightPanelRouteSearch";
import { useStore } from "../store";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const NotePanel = lazy(() => import("../components/NotePanel"));
const RIGHT_PANEL_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
const RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const RIGHT_PANEL_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
const RIGHT_PANEL_SIDEBAR_MIN_WIDTH = 26 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

function RightPanelSheet(props: {
  children: ReactNode;
  panelOpen: boolean;
  onClosePanel: () => void;
}) {
  return (
    <Sheet
      open={props.panelOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onClosePanel();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(88vw,820px)] max-w-[820px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
}

function RightPanelLoadingFallback(props: { mode: DiffPanelMode; title: string; label: string }) {
  return (
    <DiffPanelShell
      mode={props.mode}
      header={
        props.title === "Diffs" ? (
          <DiffPanelHeaderSkeleton />
        ) : (
          <div className="flex min-w-0 flex-1 items-center">
            <span className="text-sm font-medium text-foreground">{props.title}</span>
          </div>
        )
      }
    >
      <DiffPanelLoadingState label={props.label} />
    </DiffPanelShell>
  );
}

function LazyDiffPanel(props: { mode: DiffPanelMode }) {
  return (
    <DiffWorkerPoolProvider>
      <Suspense
        fallback={
          <RightPanelLoadingFallback
            mode={props.mode}
            title="Diffs"
            label="Loading diff viewer..."
          />
        }
      >
        <DiffPanel mode={props.mode} />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
}

function LazyNotePanel(props: { mode: DiffPanelMode }) {
  return (
    <Suspense
      fallback={
        <RightPanelLoadingFallback mode={props.mode} title="Notes" label="Loading notes..." />
      }
    >
      <NotePanel mode={props.mode} />
    </Suspense>
  );
}

function RightPanelInlineSidebar(props: {
  panelOpen: boolean;
  onClosePanel: () => void;
  onOpenPanel: () => void;
  children: ReactNode;
}) {
  const { panelOpen, onClosePanel, onOpenPanel, children } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenPanel();
        return;
      }
      onClosePanel();
    },
    [onClosePanel, onOpenPanel],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      wrapper.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      if (previousSidebarWidth.length > 0) {
        wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
      } else {
        wrapper.style.removeProperty("--sidebar-width");
      }

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={panelOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": RIGHT_PANEL_DEFAULT_WIDTH } as CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        resizable={{
          minWidth: RIGHT_PANEL_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {children}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
}

function ChatThreadRouteView() {
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const navigate = useNavigate();
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const threadExists = useStore((store) => store.threads.some((thread) => thread.id === threadId));
  const draftThreadExists = useComposerDraftStore((store) =>
    Object.hasOwn(store.draftThreadsByThreadId, threadId),
  );
  const routeThreadExists = threadExists || draftThreadExists;
  const rightPanel = search.rightPanel;
  const panelOpen = rightPanel !== undefined;
  const shouldUseRightPanelSheet = useMediaQuery(RIGHT_PANEL_LAYOUT_MEDIA_QUERY);
  const [lastOpenRightPanel, setLastOpenRightPanel] = useState<RightPanelId | undefined>(
    rightPanel,
  );

  const closeRightPanel = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => setRightPanelRouteSearch(previous, "diff", false),
    });
  }, [navigate, threadId]);

  const openRightPanel = useCallback(
    (panel: RightPanelId) => {
      void navigate({
        to: "/$threadId",
        params: { threadId },
        search: (previous) => setRightPanelRouteSearch(previous, panel, true),
      });
    },
    [navigate, threadId],
  );

  const reopenLastRightPanel = useCallback(() => {
    openRightPanel(lastOpenRightPanel ?? "diff");
  }, [lastOpenRightPanel, openRightPanel]);

  useEffect(() => {
    if (rightPanel) {
      setLastOpenRightPanel(rightPanel);
    }
  }, [rightPanel]);

  useEffect(() => {
    if (!bootstrapComplete) {
      return;
    }

    if (!routeThreadExists) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, navigate, routeThreadExists]);

  if (!bootstrapComplete || !routeThreadExists) {
    return null;
  }

  const renderedRightPanel = rightPanel ?? lastOpenRightPanel;
  const sidebarPanelContent =
    renderedRightPanel === "note" ? (
      <LazyNotePanel mode="sidebar" />
    ) : (
      <LazyDiffPanel mode="sidebar" />
    );
  const sheetPanelContent =
    renderedRightPanel === "note" ? <LazyNotePanel mode="sheet" /> : <LazyDiffPanel mode="sheet" />;

  if (!shouldUseRightPanelSheet) {
    return (
      <>
        <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          <ChatView threadId={threadId} />
        </SidebarInset>
        <RightPanelInlineSidebar
          panelOpen={panelOpen}
          onClosePanel={closeRightPanel}
          onOpenPanel={reopenLastRightPanel}
        >
          {renderedRightPanel ? sidebarPanelContent : null}
        </RightPanelInlineSidebar>
      </>
    );
  }

  return (
    <>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        <ChatView threadId={threadId} />
      </SidebarInset>
      <RightPanelSheet panelOpen={panelOpen} onClosePanel={closeRightPanel}>
        {renderedRightPanel ? sheetPanelContent : null}
      </RightPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseRightPanelRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<RightPanelRouteSearch>(["rightPanel"])],
  },
  component: ChatThreadRouteView,
});
