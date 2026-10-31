import { Fragment, useCallback } from "react";
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
      title="Snippets"
      placeholder="Search snippets…"
      searchText={term}
      onSearchTextChange={setTerm}
      items={items}
      detail={(item) => item.detail && <ItemDetail detail={item.detail} />}
      onAction={async (item, action) => {
        const effect = await ipc.backend.rootSearch.execute({ itemId: item.id, actionId: action.id });
        await navigation.runEffect(effect, { reload });
      }}
    />
  );
}

function ItemDetail({ detail }: { detail: NonNullable<RootItem["detail"]> }) {
  return (
    <div className="item-detail">
      <pre>{detail.text}</pre>
      <dl>
        {detail.metadata.map(({ label, value }) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
