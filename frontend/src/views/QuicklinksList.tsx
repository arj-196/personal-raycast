import { useCallback } from "react";
import { Icon } from "../components/Icon.tsx";
import { ListScreen, type ListItemModel } from "../components/ListScreen.tsx";
import { useNotification, useSearch } from "../hooks.ts";
import { ipc, type Action } from "../ipc.ts";
import { useNavigation } from "../navigation.tsx";

type QuicklinkItem = ListItemModel & { quicklinkId: number };

const ACTIONS: Action[] = [
  { id: "open", title: "Open Quicklink" },
  { id: "edit", title: "Edit Quicklink", shortcut: "⌘E" },
  { id: "copy-link", title: "Copy Link", shortcut: "⌘⇧C" },
  { id: "create", title: "Create Quicklink", shortcut: "⌘N" },
  { id: "delete", title: "Delete Quicklink", shortcut: "⌃X", destructive: true },
];

export function QuicklinksList() {
  const navigation = useNavigation();
  const load = useCallback(
    async (term: string): Promise<QuicklinkItem[]> =>
      (await ipc.backend.quicklinks.list({ term })).map((q) => ({
        id: String(q.id),
        title: q.name,
        subtitle: q.link,
        accessory: q.openWith ?? undefined,
        icon: { type: "glyph", name: "link" },
        argument: q.hasArgument ? { placeholder: "Query" } : undefined,
        actions: ACTIONS,
        quicklinkId: q.id,
      })),
    [],
  );
  const { term, setTerm, items, reload } = useSearch(load);
  useNotification("rootSearch.invalidated", reload);

  return (
    <ListScreen
      title="Search Quicklinks"
      icon={<Icon icon={{ type: "glyph", name: "link" }} size={16} />}
      placeholder="Search quicklinks…"
      searchText={term}
      onSearchTextChange={setTerm}
      items={items}
      emptyText={term ? "No Quicklinks" : "No quicklinks yet. Press ⌘N to create one."}
      onAction={async (item, action, argument) => {
        if (action.id === "create") return navigation.push({ name: "quicklink-form" });
        const effect = await ipc.backend.quicklinks.execute({ id: item.quicklinkId, actionId: action.id, argument });
        await navigation.runEffect(effect, { reload });
      }}
    />
  );
}
