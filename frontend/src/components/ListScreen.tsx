import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Action, Icon as IconModel } from "../ipc.ts";
import { useNavigation } from "../navigation.tsx";
import { matchesShortcut } from "../shortcuts.ts";
import { ActionBar, Kbd, SearchBar } from "./Chrome.tsx";
import { Icon } from "./Icon.tsx";

export type ListItemModel = {
  id: string;
  section?: string;
  title: string;
  subtitle?: string;
  accessory?: string;
  icon: IconModel;
  actions: Action[];
  argument?: { placeholder: string };
};

type Props<T extends ListItemModel> = {
  title: string;
  icon?: ReactNode;
  placeholder: string;
  searchText: string;
  onSearchTextChange(value: string): void;
  items: T[];
  onAction(item: T, action: Action, argument?: string): void | Promise<void>;
  detail?(item: T): ReactNode;
  emptyText?: string;
};

export function ListScreen<T extends ListItemModel>(props: Props<T>) {
  const { items, searchText } = props;
  const navigation = useNavigation();
  const searchRef = useRef<HTMLInputElement>(null);
  const argumentRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [argument, setArgument] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);

  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
  const selected = items[selectedIndex];

  useEffect(() => setSelectedId(null), [searchText]);
  useEffect(() => setArgument(""), [selected?.id]);

  const run = (item: T | undefined, action: Action | undefined) => {
    if (!item || !action) return;
    setPanelOpen(false);
    void Promise.resolve(props.onAction(item, action, item.argument ? argument : undefined)).catch(navigation.fail);
  };

  const move = (delta: number) => {
    if (!items.length) return;
    const next = (selectedIndex + delta + items.length) % items.length;
    setSelectedId(items[next]!.id);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (panelOpen) return;
    const isArgumentField = event.target === argumentRef.current;
    if (event.key === "ArrowDown" || (event.ctrlKey && event.key === "n")) {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
      event.preventDefault();
      move(-1);
    } else if (matchesShortcut(event, "⌘K")) {
      event.preventDefault();
      if (selected?.actions.length) setPanelOpen(true);
    } else if (event.key === "Tab" && selected?.argument) {
      event.preventDefault();
      (isArgumentField ? searchRef : argumentRef).current?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (isArgumentField) searchRef.current?.focus();
      else if (searchText && navigation.depth === 1) props.onSearchTextChange("");
      else navigation.back();
    } else if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      if (selected?.argument && !argument && !isArgumentField) argumentRef.current?.focus();
      else run(selected, selected?.actions[0]);
    } else {
      const action = selected?.actions.find((a) => a.shortcut && matchesShortcut(event, a.shortcut));
      if (action) {
        event.preventDefault();
        run(selected, action);
      }
    }
  };

  const sections = useMemo(() => groupBySection(items), [items]);

  const argumentField = selected?.argument && (
    <input
      ref={argumentRef}
      className="argument"
      spellCheck={false}
      placeholder={selected.argument.placeholder}
      value={argument}
      onChange={(e) => setArgument(e.target.value)}
      size={Math.max(selected.argument.placeholder.length, argument.length) + 1}
    />
  );

  return (
    <div className="screen" onKeyDown={onKeyDown}>
      <SearchBar ref={searchRef} value={searchText} placeholder={props.placeholder} onChange={props.onSearchTextChange} accessory={argumentField} />
      <div className={props.detail ? "body split" : "body"}>
        <div className="list" role="listbox">
          {items.length === 0 && <div className="empty">{props.emptyText ?? "No Results"}</div>}
          {sections.map(([section, sectionItems]) => (
            <div key={section ?? "_"} className="section">
              {section && <div className="section-title">{section}</div>}
              {sectionItems.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  selected={item.id === selected?.id}
                  onHover={() => setSelectedId(item.id)}
                  onClick={() => run(item, item.actions[0])}
                />
              ))}
            </div>
          ))}
        </div>
        {props.detail && <div className="detail">{selected && props.detail(selected)}</div>}
      </div>
      <ActionBar
        title={props.title}
        icon={props.icon}
        primary={selected?.actions[0]?.title}
        hasActions={!!selected && selected.actions.length > 1}
        onPrimary={() => run(selected, selected?.actions[0])}
        onOpenActions={() => setPanelOpen(true)}
      />
      {panelOpen && selected && (
        <ActionPanel
          title={selected.title}
          actions={selected.actions}
          onRun={(action) => run(selected, action)}
          onClose={() => {
            setPanelOpen(false);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function Row({ item, selected, onHover, onClick }: { item: ListItemModel; selected: boolean; onHover(): void; onClick(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <div ref={ref} className={selected ? "row selected" : "row"} role="option" aria-selected={selected} onMouseMove={selected ? undefined : onHover} onClick={onClick}>
      <Icon icon={item.icon} />
      <span className="row-title">{item.title}</span>
      {item.subtitle && <span className="row-subtitle">{item.subtitle}</span>}
      {item.accessory && <span className="row-accessory">{item.accessory}</span>}
    </div>
  );
}

function ActionPanel({ title, actions, onRun, onClose }: { title: string; actions: Action[]; onRun(action: Action): void; onClose(): void }) {
  const [filter, setFilter] = useState("");
  const [index, setIndex] = useState(0);
  const visible = actions.filter((a) => a.title.toLowerCase().includes(filter.toLowerCase()));
  useEffect(() => setIndex(0), [filter]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape" || matchesShortcut(event, "⌘K")) {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (visible[index]) onRun(visible[index]);
    } else {
      const action = actions.find((a) => a.shortcut && matchesShortcut(event, a.shortcut));
      if (action) {
        event.preventDefault();
        onRun(action);
      }
    }
  };

  return (
    <>
      <div className="panel-scrim" onClick={onClose} />
      <div className="action-panel" onKeyDown={onKeyDown}>
        <div className="action-panel-title">{title}</div>
        {visible.map((action, i) => (
          <div
            key={action.id}
            className={`action-row${i === index ? " selected" : ""}${action.destructive ? " destructive" : ""}`}
            onMouseMove={() => setIndex(i)}
            onClick={() => onRun(action)}
          >
            <span>{action.title}</span>
            {i === 0 && !filter ? <Kbd shortcut="↵" /> : action.shortcut && <Kbd shortcut={action.shortcut} />}
          </div>
        ))}
        {visible.length === 0 && <div className="action-row muted">No Actions</div>}
        <input className="action-panel-search" autoFocus placeholder="Search for actions…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
    </>
  );
}

function groupBySection<T extends ListItemModel>(items: T[]): [string | undefined, T[]][] {
  const groups: [string | undefined, T[]][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last[0] === item.section) last[1].push(item);
    else groups.push([item.section, [item]]);
  }
  return groups;
}
