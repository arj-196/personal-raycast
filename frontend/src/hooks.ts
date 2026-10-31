import { useCallback, useEffect, useRef, useState } from "react";
import { subscribe } from "./ipc.ts";
import { useNavigation } from "./navigation.tsx";

/** Search text + results, dropping responses that arrive after a newer query. */
export function useSearch<T>(load: (term: string) => Promise<T[]>) {
  const { fail } = useNavigation();
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const sequence = useRef(0);
  const termRef = useRef(term);
  termRef.current = term;

  const reload = useCallback(() => {
    const request = ++sequence.current;
    load(termRef.current)
      .then((next) => {
        if (request === sequence.current) setItems(next);
      })
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(reload, [term, reload]);
  return { term, setTerm, items, reload };
}

export function useNotification(method: string, listener: (data: any) => void) {
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => subscribe(method, (data) => latest.current(data)), [method]);
}
