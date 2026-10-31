import { useEffect, useState } from "react";
import { Field, FormScreen } from "../components/FormScreen.tsx";
import { Icon } from "../components/Icon.tsx";
import { ipc, type App } from "../ipc.ts";
import { useNavigation } from "../navigation.tsx";

export function QuicklinkForm({ id }: { id?: number }) {
  const navigation = useNavigation();
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [openWith, setOpenWith] = useState("");
  const [apps, setApps] = useState<App[]>([]);

  useEffect(() => {
    ipc.backend.apps.list().then(setApps).catch(navigation.fail);
    if (id === undefined) return;
    ipc.backend.quicklinks
      .get({ id })
      .then((q) => {
        setName(q.name);
        setLink(q.link);
        setOpenWith(q.openWith ?? "");
      })
      .catch(navigation.fail);
  }, [id]);

  return (
    <FormScreen
      title={id === undefined ? "Create Quicklink" : "Edit Quicklink"}
      icon={<Icon icon={{ type: "glyph", name: "link-add" }} size={16} />}
      submitTitle="Save Quicklink"
      onSubmit={async () => {
        const input = { name, link, openWith: openWith || null };
        if (id === undefined) await ipc.backend.quicklinks.create(input);
        else await ipc.backend.quicklinks.update({ id, ...input });
        navigation.pop();
        navigation.showToast({ style: "success", title: id === undefined ? "Quicklink created" : "Quicklink saved" });
      }}
    >
      <Field label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Search GitHub" />
      </Field>
      <Field
        label="Link"
        hint={
          <>
            URL, file path or deeplink. Use <code>{"{argument}"}</code> for a query typed after the name, or{" "}
            <code>{"{clipboard}"}</code>.
          </>
        }
      >
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://github.com/search?q={argument}" spellCheck={false} />
      </Field>
      <Field label="Open With">
        <select value={openWith} onChange={(e) => setOpenWith(e.target.value)}>
          <option value="">Default Application</option>
          {apps.map((app) => (
            <option key={app.path} value={app.path}>
              {app.name}
            </option>
          ))}
        </select>
      </Field>
    </FormScreen>
  );
}
