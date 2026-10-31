import { forwardRef, type ReactNode } from "react";
import { keycaps } from "../shortcuts.ts";
import { useNavigation } from "../navigation.tsx";
import type { Toast } from "../ipc.ts";

export function Kbd({ shortcut }: { shortcut: string }) {
  return (
    <span className="kbd">
      {keycaps(shortcut).map((cap, i) => (
        <kbd key={i}>{cap}</kbd>
      ))}
    </span>
  );
}

type SearchBarProps = {
  value: string;
  placeholder: string;
  onChange(value: string): void;
  onKeyDown?(event: React.KeyboardEvent<HTMLInputElement>): void;
  accessory?: ReactNode;
};

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(props, ref) {
  const navigation = useNavigation();
  return (
    <header className="search-bar">
      {navigation.depth > 1 && (
        <button className="back" onClick={navigation.pop} aria-label="Back" tabIndex={-1}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      <input
        ref={ref}
        data-search-input
        autoFocus
        spellCheck={false}
        autoComplete="off"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={props.onKeyDown}
      />
      {props.accessory}
    </header>
  );
});

type ActionBarProps = {
  title: string;
  icon?: ReactNode;
  primary?: string;
  primaryShortcut?: string;
  hasActions?: boolean;
  onOpenActions?(): void;
  onPrimary?(): void;
};

export function ActionBar({ title, icon, primary, primaryShortcut = "↵", hasActions, onOpenActions, onPrimary }: ActionBarProps) {
  const { toast } = useNavigation();
  return (
    <footer className="action-bar">
      <div className="action-bar-left">{toast ? <ToastView toast={toast} /> : <>{icon}<span>{title}</span></>}</div>
      <div className="action-bar-right">
        {primary && (
          <button className="bar-button primary" onClick={onPrimary} tabIndex={-1}>
            {primary} <Kbd shortcut={primaryShortcut} />
          </button>
        )}
        {hasActions && (
          <>
            <span className="divider" />
            <button className="bar-button" onClick={onOpenActions} tabIndex={-1}>
              Actions <Kbd shortcut="⌘K" />
            </button>
          </>
        )}
      </div>
    </footer>
  );
}

function ToastView({ toast }: { toast: Toast }) {
  return (
    <span className={`toast ${toast.style}`}>
      <span className="toast-dot" />
      <strong>{toast.title}</strong>
      {toast.message && <span className="toast-message">{toast.message}</span>}
    </span>
  );
}
