import { useState, type ReactNode } from "react";
import { useNavigation } from "../navigation.tsx";
import { matchesShortcut } from "../shortcuts.ts";
import { ActionBar } from "./Chrome.tsx";

type Props = {
  title: string;
  icon?: ReactNode;
  submitTitle: string;
  onSubmit(): Promise<void>;
  children: ReactNode;
};

/** Raycast-style form: labelled rows, ⌘↵ submits, Esc goes back. */
export function FormScreen({ title, icon, submitTitle, onSubmit, children }: Props) {
  const navigation = useNavigation();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit();
    } catch (error) {
      navigation.fail(error);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (matchesShortcut(event, "⌘↵")) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      navigation.back();
    }
  };

  return (
    <div className="screen" onKeyDown={onKeyDown}>
      <header className="search-bar form-header">
        <button className="back" onClick={navigation.pop} aria-label="Back" tabIndex={-1}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="form-title">{title}</span>
      </header>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {children}
      </form>
      <ActionBar title={title} icon={icon} primary={submitTitle} primaryShortcut="⌘↵" onPrimary={submit} />
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">
        {children}
        {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}
