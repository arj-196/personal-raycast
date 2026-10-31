import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ipc, type Effect, type Route, type Toast } from "./ipc.ts";

export type Screen = { name: "root" } | Route;
type Entry = { key: number; screen: Screen };

type Navigation = {
  depth: number;
  push(screen: Screen): void;
  pop(): void;
  popToRoot(): void;
  /** Esc semantics: pop a level, or hide the window from the root. */
  back(): void;
  toast: Toast | null;
  showToast(toast: Toast): void;
  runEffect(effect: Effect, options?: { reload?: () => void }): Promise<void>;
  /** Shows a failure toast for a rejected IPC call. */
  fail(error: unknown): void;
};

const NavigationContext = createContext<Navigation | null>(null);

export function useNavigation(): Navigation {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("useNavigation outside NavigationProvider");
  return navigation;
}

export function NavigationProvider({ render }: { render: (entries: Entry[]) => ReactNode }) {
  const nextKey = useRef(1);
  const [entries, setEntries] = useState<Entry[]>([{ key: 0, screen: { name: "root" } }]);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((next: Toast) => {
    setToast(next);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), next.style === "failure" ? 4000 : 2500);
  }, []);

  const push = useCallback((screen: Screen) => setEntries((e) => [...e, { key: nextKey.current++, screen }]), []);
  const pop = useCallback(() => setEntries((e) => (e.length > 1 ? e.slice(0, -1) : e)), []);
  const popToRoot = useCallback(() => setEntries((e) => e.slice(0, 1)), []);

  const value = useMemo<Navigation>(() => {
    const hide = async (hud?: string) => {
      popToRoot();
      await ipc.host.raycast.hideMainWindow({ hud });
    };
    const fail = (error: unknown) =>
      showToast({ style: "failure", title: "Something went wrong", message: error instanceof Error ? error.message : String(error) });

    return {
      depth: entries.length,
      push,
      pop,
      popToRoot,
      back: () => (entries.length > 1 ? pop() : void hide()),
      toast,
      showToast,
      fail,
      async runEffect(effect, options = {}) {
        switch (effect.type) {
          case "hide":
            return hide(effect.hud);
          case "push":
            return push(effect.route);
          case "paste":
            popToRoot();
            await ipc.host.raycast.pasteText({ text: effect.text, cursorFromEnd: effect.cursorFromEnd });
            return;
          case "toast":
            return showToast(effect);
          case "refresh":
            options.reload?.();
            if (effect.toast) showToast(effect.toast);
            return;
          case "quit":
            await ipc.host.raycast.quit();
            return;
        }
      },
    };
  }, [entries.length, push, pop, popToRoot, toast, showToast]);

  return <NavigationContext.Provider value={value}>{render(entries)}</NavigationContext.Provider>;
}
