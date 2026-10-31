import AppKit
import Carbon

/// System-wide hotkey via Carbon's RegisterEventHotKey (no Accessibility permission needed).
final class HotKey {
    private static var actions: [UInt32: () -> Void] = [:]
    private static var nextID: UInt32 = 1
    private static var handlerInstalled = false
    private var reference: EventHotKeyRef?
    private let id: UInt32

    /// `keyCode` is a virtual key code (kVK_*), `modifiers` Carbon flags (optionKey, cmdKey, …).
    init?(keyCode: Int, modifiers: Int, action: @escaping () -> Void) {
        Self.installHandler()
        id = Self.nextID
        Self.nextID += 1
        let hotKeyID = EventHotKeyID(signature: OSType(0x5052_4331), id: id) // "PRC1"
        let status = RegisterEventHotKey(UInt32(keyCode), UInt32(modifiers), hotKeyID, GetApplicationEventTarget(), 0, &reference)
        guard status == noErr else {
            NSLog("RegisterEventHotKey failed (\(status)); is the shortcut taken?")
            return nil
        }
        Self.actions[id] = action
    }

    deinit {
        if let reference { UnregisterEventHotKey(reference) }
        Self.actions[id] = nil
    }

    private static func installHandler() {
        guard !handlerInstalled else { return }
        handlerInstalled = true
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
            var id = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            DispatchQueue.main.async { HotKey.actions[id.id]?() }
            return noErr
        }, 1, &spec, nil, nil)
    }
}

/// The launcher's global shortcut as the backend stores it: `{modifiers: ["control"], key: "Space"}`,
/// where `key` is a DOM `KeyboardEvent.code` so the web recorder can produce it directly.
struct Shortcut: Equatable {
    static let `default` = Shortcut(modifiers: ["option"], key: "Space")

    let modifiers: [String]
    let key: String

    init(modifiers: [String], key: String) {
        self.modifiers = modifiers
        self.key = key
    }

    init?(json: Any?) {
        guard let dict = json as? [String: Any], let key = dict["key"] as? String,
              let modifiers = dict["modifiers"] as? [String] else { return nil }
        self.init(modifiers: modifiers, key: key)
    }

    var keyCode: Int? { Self.keyCodes[key] }

    var carbonModifiers: Int {
        modifiers.reduce(0) { flags, modifier in
            switch modifier {
            case "control": return flags | controlKey
            case "option": return flags | optionKey
            case "shift": return flags | shiftKey
            case "command": return flags | cmdKey
            default: return flags
            }
        }
    }

    var menuModifiers: NSEvent.ModifierFlags {
        var flags: NSEvent.ModifierFlags = []
        if modifiers.contains("control") { flags.insert(.control) }
        if modifiers.contains("option") { flags.insert(.option) }
        if modifiers.contains("shift") { flags.insert(.shift) }
        if modifiers.contains("command") { flags.insert(.command) }
        return flags
    }

    /// For NSMenuItem.keyEquivalent; empty when the key has no simple character.
    var menuKeyEquivalent: String {
        if key == "Space" { return " " }
        if key.hasPrefix("Key") || key.hasPrefix("Digit") { return String(key.last!).lowercased() }
        return ""
    }

    /// "⌃Space", "⌥⌘K".
    var display: String {
        let glyphs = [("control", "⌃"), ("option", "⌥"), ("shift", "⇧"), ("command", "⌘")]
            .filter { modifiers.contains($0.0) }.map(\.1).joined()
        let name: String
        if key.hasPrefix("Key") || key.hasPrefix("Digit") { name = String(key.last!) }
        else { name = Self.keyNames[key] ?? key }
        return glyphs + name
    }

    private static let keyNames = [
        "ArrowLeft": "←", "ArrowRight": "→", "ArrowUp": "↑", "ArrowDown": "↓", "Enter": "↵", "Backspace": "⌫",
        "Minus": "-", "Equal": "=", "BracketLeft": "[", "BracketRight": "]", "Backslash": "\\", "Semicolon": ";",
        "Quote": "'", "Comma": ",", "Period": ".", "Slash": "/", "Backquote": "`",
    ]

    private static let keyCodes: [String: Int] = {
        var codes: [String: Int] = [
            "Space": kVK_Space, "Enter": kVK_Return, "Tab": kVK_Tab, "Backspace": kVK_Delete,
            "ArrowLeft": kVK_LeftArrow, "ArrowRight": kVK_RightArrow, "ArrowUp": kVK_UpArrow, "ArrowDown": kVK_DownArrow,
            "Minus": kVK_ANSI_Minus, "Equal": kVK_ANSI_Equal, "BracketLeft": kVK_ANSI_LeftBracket,
            "BracketRight": kVK_ANSI_RightBracket, "Backslash": kVK_ANSI_Backslash, "Semicolon": kVK_ANSI_Semicolon,
            "Quote": kVK_ANSI_Quote, "Comma": kVK_ANSI_Comma, "Period": kVK_ANSI_Period, "Slash": kVK_ANSI_Slash,
            "Backquote": kVK_ANSI_Grave,
        ]
        let letters = [kVK_ANSI_A, kVK_ANSI_B, kVK_ANSI_C, kVK_ANSI_D, kVK_ANSI_E, kVK_ANSI_F, kVK_ANSI_G, kVK_ANSI_H,
                       kVK_ANSI_I, kVK_ANSI_J, kVK_ANSI_K, kVK_ANSI_L, kVK_ANSI_M, kVK_ANSI_N, kVK_ANSI_O, kVK_ANSI_P,
                       kVK_ANSI_Q, kVK_ANSI_R, kVK_ANSI_S, kVK_ANSI_T, kVK_ANSI_U, kVK_ANSI_V, kVK_ANSI_W, kVK_ANSI_X,
                       kVK_ANSI_Y, kVK_ANSI_Z]
        for (offset, code) in letters.enumerated() { codes["Key\(Character(UnicodeScalar(65 + offset)!))"] = code }
        let digits = [kVK_ANSI_0, kVK_ANSI_1, kVK_ANSI_2, kVK_ANSI_3, kVK_ANSI_4, kVK_ANSI_5, kVK_ANSI_6, kVK_ANSI_7,
                      kVK_ANSI_8, kVK_ANSI_9]
        for (digit, code) in digits.enumerated() { codes["Digit\(digit)"] = code }
        let functionKeys = [kVK_F1, kVK_F2, kVK_F3, kVK_F4, kVK_F5, kVK_F6, kVK_F7, kVK_F8, kVK_F9, kVK_F10,
                            kVK_F11, kVK_F12, kVK_F13, kVK_F14, kVK_F15, kVK_F16, kVK_F17, kVK_F18, kVK_F19, kVK_F20]
        for (index, code) in functionKeys.enumerated() { codes["F\(index + 1)"] = code }
        return codes
    }()
}

/// Owns the registered launcher hotkey: `host.hotkey.updateGlobal` swaps it, `toggleRecording` lifts
/// it while the settings recorder listens, so pressing the current shortcut doesn't hide the window.
final class GlobalHotKeyController {
    private(set) var shortcut = Shortcut.default
    private var hotKey: HotKey?
    private let action: () -> Void
    var onChange: ((Shortcut) -> Void)?

    init(action: @escaping () -> Void) {
        self.action = action
    }

    /// Registers `next`; if macOS refuses it, the previous shortcut stays registered and this throws.
    func update(_ next: Shortcut) throws {
        guard let keyCode = next.keyCode else { throw IPCError(message: "Unsupported key: \(next.key)") }
        hotKey = nil
        guard let registered = HotKey(keyCode: keyCode, modifiers: next.carbonModifiers, action: action) else {
            register(shortcut)
            throw IPCError(message: "\(next.display) is taken by another app or by macOS")
        }
        hotKey = registered
        shortcut = next
        NSLog("Global hotkey set to \(next.display)")
        onChange?(next)
    }

    func setRecording(_ recording: Bool) {
        if recording { hotKey = nil } else if hotKey == nil { register(shortcut) }
    }

    func register(_ shortcut: Shortcut) {
        guard let keyCode = shortcut.keyCode else { return }
        hotKey = HotKey(keyCode: keyCode, modifiers: shortcut.carbonModifiers, action: action)
    }
}
