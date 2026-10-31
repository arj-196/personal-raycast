import AppKit
import ApplicationServices

/// Types into the frontmost app by synthesizing keystrokes. Needs Accessibility permission.
final class Paster {
    /// Stamped on synthesized events so the snippet expander ignores them.
    static let marker: Int64 = 0x505243 // "PRC"

    private enum Key {
        static let v: CGKeyCode = 9
        static let delete: CGKeyCode = 51
        static let leftArrow: CGKeyCode = 123
    }

    static func isTrusted(prompt: Bool) -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    /// Pastes `text` via ⌘V, then restores the previous clipboard. Returns false (leaving
    /// `text` on the clipboard) when Accessibility isn't granted.
    @discardableResult
    func paste(_ text: String, cursorFromEnd: Int = 0) -> Bool {
        let pasteboard = NSPasteboard.general
        let saved = Self.snapshot(pasteboard)
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        guard Self.isTrusted(prompt: true) else { return false }
        let ourChange = pasteboard.changeCount

        // Give the previous app a beat to become active again after we hide.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            self.press(Key.v, flags: .maskCommand)
            for _ in 0..<max(cursorFromEnd, 0) { self.press(Key.leftArrow) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                if pasteboard.changeCount == ourChange { Self.restore(saved, to: pasteboard) }
            }
        }
        return true
    }

    func deleteBackward(_ count: Int) {
        for _ in 0..<count { press(Key.delete) }
    }

    private func press(_ key: CGKeyCode, flags: CGEventFlags = []) {
        let source = CGEventSource(stateID: .hidSystemState)
        for isDown in [true, false] {
            guard let event = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: isDown) else { continue }
            event.flags = flags
            event.setIntegerValueField(.eventSourceUserData, value: Self.marker)
            event.post(tap: .cghidEventTap)
        }
    }

    private static func snapshot(_ pasteboard: NSPasteboard) -> [[NSPasteboard.PasteboardType: Data]] {
        (pasteboard.pasteboardItems ?? []).map { item in
            Dictionary(uniqueKeysWithValues: item.types.compactMap { type in item.data(forType: type).map { (type, $0) } })
        }
    }

    private static func restore(_ items: [[NSPasteboard.PasteboardType: Data]], to pasteboard: NSPasteboard) {
        pasteboard.clearContents()
        guard !items.isEmpty else { return }
        pasteboard.writeObjects(items.map { entries in
            let item = NSPasteboardItem()
            for (type, data) in entries { item.setData(data, forType: type) }
            return item
        })
    }
}
