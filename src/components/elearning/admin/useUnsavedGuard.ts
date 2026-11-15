import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { confirmDialog } from "@/components/ConfirmDialogHost";

export const LEAVE_CONFIRM = {
  title: "Leave without saving?",
  description: "Your changes to this course are not saved yet. If you leave now, they are lost.",
  confirmText: "Leave without saving",
  cancelText: "Keep editing",
  destructive: true,
} as const;

/**
 * Warn before unsaved course edits are lost. The app uses <BrowserRouter> (no
 * data-router `useBlocker`), so this covers: closing / reloading the tab
 * (beforeunload) and clicking any in-app link, such as the admin sidebar
 * (caught in the capture phase before React Router sees it).
 */
export const useUnsavedGuard = (dirty: boolean) => {
  const navigate = useNavigate();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      void confirmDialog(LEAVE_CONFIRM).then((leave) => {
        if (leave) {
          dirtyRef.current = false;
          navigate(`${url.pathname}${url.search}${url.hash}`);
        }
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);
};
