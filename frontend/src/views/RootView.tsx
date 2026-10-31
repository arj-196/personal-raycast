import { useCallback } from "react";
import { ListScreen } from "../components/ListScreen.tsx";
import { useNotification, useSearch } from "../hooks.ts";
import { ipc, type RootItem } from "../ipc.ts";
import { useNavigation } from "../navigation.tsx";

export function RootView() {
  const navigation = useNavigation();
  const load = useCallback(async (term: string) => (await ipc.backend.rootSearch.search({ term })).items, []);
  const { term, setTerm, items, reload } = useSearch<RootItem>(load);

  useNotification("rootSearch.invalidated", reload);

  return (
    <ListScreen
      title="Search"
      placeholder="Search for apps and commands…"
      searchText={term}
      onSearchTextChange={setTerm}
      items={items}
      onAction={async (item, action, argument) => {
        const effect = await ipc.backend.rootSearch.execute({ itemId: item.id, actionId: action.id, argument, term });
        await navigation.runEffect(effect, { reload });
      }}
    />
  );
}
