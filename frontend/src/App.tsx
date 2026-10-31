import { useEffect, useState } from "react";
import { useNotification } from "./hooks.ts";
import { hasNativeHost } from "./ipc.ts";
import { NavigationProvider, useNavigation, type Screen } from "./navigation.tsx";
import { RootView } from "./views/RootView.tsx";
import { SettingsView } from "./views/SettingsView.tsx";
import { SnippetForm } from "./views/SnippetForm.tsx";

/** Matches Raycast's default "pop to root search after 90 seconds". */
const POP_TO_ROOT_AFTER_SECONDS = 90;

export function App() {
  return (
    <div className={hasNativeHost ? "window" : "window dev"}>
      <NavigationProvider
        render={(entries) => (
          <>
            <WindowLifecycle />
            {entries.map((entry, index) => (
              <div key={entry.key} className="stack-entry" hidden={index !== entries.length - 1}>
                <ScreenView screen={entry.screen} />
              </div>
            ))}
            <FocusTop depth={entries.length} />
          </>
        )}
      />
    </div>
  );
}

function ScreenView({ screen }: { screen: Screen }) {
  const [rootGeneration, setRootGeneration] = useState(0);
  useNotification("raycast.mainWindowShown", ({ hiddenForSeconds }: { hiddenForSeconds: number }) => {
    if (screen.name === "root" && hiddenForSeconds > POP_TO_ROOT_AFTER_SECONDS) setRootGeneration((g) => g + 1);
  });
  switch (screen.name) {
    case "root":
      return <RootView key={rootGeneration} />;
    case "snippet-form":
      return <SnippetForm id={screen.id} />;
    case "settings":
      return <SettingsView />;
  }
}

function WindowLifecycle() {
  const navigation = useNavigation();
  useNotification("raycast.mainWindowShown", ({ hiddenForSeconds }: { hiddenForSeconds: number }) => {
    if (hiddenForSeconds > POP_TO_ROOT_AFTER_SECONDS) navigation.popToRoot();
    requestAnimationFrame(() => focusTop(true));
  });
  return null;
}

/** Hidden stack entries keep their state; give focus back to whichever screen is on top. */
function FocusTop({ depth }: { depth: number }) {
  useEffect(() => focusTop(false), [depth]);
  return null;
}

function focusTop(select: boolean) {
  const top = document.querySelector<HTMLElement>(".stack-entry:not([hidden])");
  const input = top?.querySelector<HTMLInputElement>("[data-search-input], input, textarea");
  input?.focus();
  if (select) input?.select();
}
