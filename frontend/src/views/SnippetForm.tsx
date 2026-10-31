import { useEffect, useState } from "react";
import { Field, FormScreen } from "../components/FormScreen.tsx";
import { Icon } from "../components/Icon.tsx";
import { ipc } from "../ipc.ts";
import { useNavigation } from "../navigation.tsx";

export function SnippetForm({ id }: { id?: number }) {
  const navigation = useNavigation();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [keywordError, setKeywordError] = useState<string | null>(null);

  useEffect(() => {
    if (id === undefined) return;
    ipc.backend.snippets
      .get({ id })
      .then((snippet) => {
        setName(snippet.name);
        setText(snippet.text);
        setKeyword(snippet.keyword ?? "");
      })
      .catch(navigation.fail);
  }, [id]);

  useEffect(() => {
    const value = keyword.trim();
    if (!value) return setKeywordError(null);
    if (/\s/.test(value)) return setKeywordError("Keyword can't contain spaces");
    let current = true;
    ipc.backend.snippets
      .isKeywordAvailable({ keyword: value, excludeId: id })
      .then((available) => current && setKeywordError(available ? null : "Keyword is already in use"));
    return () => {
      current = false;
    };
  }, [keyword, id]);

  return (
    <FormScreen
      title={id === undefined ? "Create Snippet" : "Edit Snippet"}
      icon={<Icon icon={{ type: "glyph", name: "snippet-add" }} size={16} />}
      submitTitle="Save Snippet"
      onSubmit={async () => {
        const input = { name, text, keyword: keyword.trim() || null };
        if (id === undefined) await ipc.backend.snippets.create(input);
        else await ipc.backend.snippets.update({ id, ...input });
        navigation.pop();
        navigation.showToast({ style: "success", title: id === undefined ? "Snippet created" : "Snippet saved" });
      }}
    >
      <Field label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Email signature" />
      </Field>
      <Field
        label="Snippet"
        hint={
          <>
            Placeholders: <code>{"{clipboard}"}</code> <code>{"{date}"}</code> <code>{"{time}"}</code> <code>{"{day}"}</code>{" "}
            <code>{"{uuid}"}</code> <code>{"{cursor}"}</code>
          </>
        }
      >
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Best,&#10;Arjun" />
      </Field>
      <Field label="Keyword" error={keywordError} hint="Typing the keyword in any app expands the snippet.">
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder=";sig" spellCheck={false} />
      </Field>
    </FormScreen>
  );
}
