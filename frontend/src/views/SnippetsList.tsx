import { useCallback } from "react";
import { Icon } from "../components/Icon.tsx";
import { ListScreen, type ListItemModel } from "../components/ListScreen.tsx";
import { useSearch } from "../hooks.ts";
import { ipc, type Action, type Snippet } from "../ipc.ts";
import { useNavigation } from "../navigation.tsx";

type SnippetItem = ListItemModel & { snippet: Snippet };

const ACTIONS: Action[] = [
  { id: "paste", title: "Paste Snippet" },
  { id: "copy", title: "Copy to Clipboard", shortcut: "⌘↵" },
  { id: "edit", title: "Edit Snippet", shortcut: "⌘E" },
  { id: "create", title: "Create Snippet", shortcut: "⌘N" },
  { id: "delete", title: "Delete Snippet", shortcut: "⌃X", destructive: true },
];

export function SnippetsList() {
  const navigation = useNavigation();
  const load = useCallback(
    async (term: string): Promise<SnippetItem[]> =>
      (await ipc.backend.snippets.list({ term })).map((snippet) => ({
        id: String(snippet.id),
        title: snippet.name,
        accessory: snippet.keyword ?? undefined,
        icon: { type: "glyph", name: "snippet" },
        actions: ACTIONS,
        snippet,
      })),
    [],
  );
  const { term, setTerm, items, reload } = useSearch(load);

  return (
    <ListScreen
      title="Search Snippets"
      icon={<Icon icon={{ type: "glyph", name: "snippet" }} size={16} />}
      placeholder="Search snippets…"
      searchText={term}
      onSearchTextChange={setTerm}
      items={items}
      emptyText={term ? "No Snippets" : "No snippets yet. Press ⌘N to create one."}
      detail={(item) => (
        <div className="snippet-detail">
          <pre>{item.snippet.text}</pre>
          <dl>
            <dt>Keyword</dt>
            <dd>{item.snippet.keyword ?? "—"}</dd>
            <dt>Updated</dt>
            <dd>{new Date(item.snippet.updatedAt).toLocaleString()}</dd>
          </dl>
        </div>
      )}
      onAction={async (item, action) => {
        if (action.id === "create") return navigation.push({ name: "snippet-form" });
        const effect = await ipc.backend.snippets.execute({ id: item.snippet.id, actionId: action.id });
        await navigation.runEffect(effect, { reload });
      }}
    />
  );
}
