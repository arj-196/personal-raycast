import { useEffect, useRef, useState } from "react";
import { Field, FormScreen } from "../components/FormScreen.tsx";
import { Icon } from "../components/Icon.tsx";
import { hasNativeHost, ipc, type Hotkey, type Modifier } from "../ipc.ts";
import { useNavigation } from "../navigation.tsx";

/** A pushed view rather than Raycast's separate settings window: there's one setting so far. */
export function SettingsView() {
  const navigation = useNavigation();
  const [hotkey, setHotkey] = useState<Hotkey | null>(null);

  useEffect(() => {
    ipc.backend.settings.getGeneralSettings({}).then((s) => setHotkey(s.globalHotkey), navigation.fail);
  }, []);

  // Same order as Raycast: register with the host first, so a taken shortcut is never saved.
  const save = async (next: Hotkey) => {
    try {
      await ipc.host.hotkey.updateGlobal({ hotkey: next });
      await ipc.backend.settings.updateGeneralSettings({ globalHotkey: next });
      setHotkey(next);
      navigation.showToast({ style: "success", title: `Hotkey set to ${hotkeyCaps(next).join("")}` });
    } catch (error) {
      navigation.fail(error);
    }
  };

  return (
    <FormScreen
      title="Settings"
      icon={<Icon icon={{ type: "glyph", name: "gear" }} size={16} />}
      submitTitle="Done"
      onSubmit={async () => navigation.pop()}
    >
      <Field
        label="Launcher Hotkey"
        hint={hasNativeHost ? "Click, then press the new shortcut. Esc cancels." : "Saved, but only the app registers it."}
      >
        {hotkey && <HotkeyRecorder hotkey={hotkey} onChange={save} />}
      </Field>
    </FormScreen>
  );
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

function HotkeyRecorder({ hotkey, onChange }: { hotkey: Hotkey; onChange(next: Hotkey): void }) {
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<Modifier[]>([]);
  const button = useRef<HTMLButtonElement>(null);
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;

  // Listens on the window, not the button: WebKit doesn't focus a button on click, so the button
  // never gets key events, and unhandled keys make macOS beep.
  useEffect(() => {
    if (!recording) return;
    // Lifts the current hotkey while listening, so pressing it doesn't hide the window.
    void ipc.host.hotkey.toggleRecording({ enabled: true });
    const stop = () => setRecording(false);
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const modifiers = modifiersOf(event);
      if (event.key === "Escape" && !modifiers.length) return stop();
      if (MODIFIER_KEYS.has(event.key)) return setHeld(modifiers);
      // A bare key would swallow that key everywhere; function keys are the exception.
      if (!modifiers.length && !/^F\d+$/.test(event.code)) return;
      stop();
      latestOnChange.current({ modifiers, key: event.code });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setHeld(modifiersOf(event));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!button.current?.contains(event.target as Node)) stop();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", stop);
      setHeld([]);
      void ipc.host.hotkey.toggleRecording({ enabled: false });
    };
  }, [recording]);

  return (
    <button
      ref={button}
      type="button"
      autoFocus
      className={recording ? "hotkey-recorder recording" : "hotkey-recorder"}
      onClick={() => {
        button.current?.focus();
        setRecording((r) => !r);
      }}
    >
      {recording ? (
        held.length ? <Keycaps caps={hotkeyCaps({ modifiers: held, key: "" }).filter(Boolean)} /> : "Press a shortcut…"
      ) : (
        <Keycaps caps={hotkeyCaps(hotkey)} />
      )}
    </button>
  );
}

function Keycaps({ caps }: { caps: string[] }) {
  return (
    <span className="kbd">
      {caps.map((cap, i) => (
        <kbd key={i}>{cap}</kbd>
      ))}
    </span>
  );
}

function modifiersOf(event: KeyboardEvent): Modifier[] {
  const modifiers: Modifier[] = [];
  if (event.ctrlKey) modifiers.push("control");
  if (event.altKey) modifiers.push("option");
  if (event.shiftKey) modifiers.push("shift");
  if (event.metaKey) modifiers.push("command");
  return modifiers;
}

const MODIFIER_GLYPHS: [Modifier, string][] = [
  ["control", "⌃"],
  ["option", "⌥"],
  ["shift", "⇧"],
  ["command", "⌘"],
];

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Enter: "↵",
  Backspace: "⌫",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

/** ["⌃", "Space"]; mirrors Shortcut.display in host/Sources/PersonalRaycast/HotKey.swift. */
export function hotkeyCaps({ modifiers, key }: Hotkey): string[] {
  const caps = MODIFIER_GLYPHS.filter(([m]) => modifiers.includes(m)).map(([, glyph]) => glyph);
  const name = /^(Key|Digit)/.test(key) ? key.slice(-1) : (KEY_NAMES[key] ?? key);
  return [...caps, name];
}
