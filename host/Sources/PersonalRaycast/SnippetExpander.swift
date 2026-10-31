import AppKit

/// Watches typing system-wide; when the recent characters end with a snippet keyword, erases the
/// keyword and pastes the expanded snippet. Keywords are pushed from the backend.
final class SnippetExpander {
    private let backend: Backend
    private let paster: Paster
    private let isSuspended: () -> Bool
    private var keywords: [String] = []
    private var typed = ""
    private var tap: CFMachPort?
    private var retryTimer: Timer?

    /// Return, tab, escape, arrows, forward delete, home/end, page up/down: the caret moved.
    private static let resetKeys: Set<Int64> = [36, 48, 53, 76, 115, 116, 117, 119, 121, 123, 124, 125, 126]
    private static let deleteKey: Int64 = 51
    private static let maxTyped = 64

    init(backend: Backend, paster: Paster, isSuspended: @escaping () -> Bool) {
        self.backend = backend
        self.paster = paster
        self.isSuspended = isSuspended
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) {
            [weak self] _ in self?.typed = ""
        }
    }

    func update(keywords: [String]) {
        // Longest first, so ";addr2" wins over ";addr".
        self.keywords = keywords.filter { !$0.isEmpty }.sorted { $0.count > $1.count }
        if !self.keywords.isEmpty && tap == nil { installTap() }
    }

    private func installTap() {
        let mask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue)
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: CGEventMask(mask),
            callback: snippetTapCallback,
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            // Not trusted yet: ask once, then keep checking until the user grants it.
            if retryTimer == nil {
                _ = Paster.isTrusted(prompt: true)
                NSLog("Snippet expansion needs Accessibility permission; waiting for it")
                retryTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.installTap() }
            }
            return
        }
        retryTimer?.invalidate()
        retryTimer = nil
        self.tap = tap
        CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, tap, 0), .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    fileprivate func handle(type: CGEventType, event: CGEvent) {
        switch type {
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
        case .keyDown:
            guard event.getIntegerValueField(.eventSourceUserData) != Paster.marker else { return }
            let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
            if isSuspended() || event.flags.contains(.maskCommand) || event.flags.contains(.maskControl) || Self.resetKeys.contains(keyCode) {
                typed = ""
            } else if keyCode == Self.deleteKey {
                if !typed.isEmpty { typed.removeLast() }
            } else if let characters = NSEvent(cgEvent: event)?.characters, !characters.isEmpty {
                typed.append(characters)
                if typed.count > Self.maxTyped { typed.removeFirst(typed.count - Self.maxTyped) }
                if let keyword = keywords.first(where: { typed.hasSuffix($0) }) {
                    typed = ""
                    expand(keyword)
                }
            }
        default:
            typed = "" // mouse click: the caret probably moved
        }
    }

    private func expand(_ keyword: String) {
        backend.request("snippets.expand", ["keyword": keyword]) { [weak self] result in
            guard let self, case let .success(value) = result, let expansion = value as? [String: Any],
                  let text = expansion["text"] as? String else { return }
            self.paster.deleteBackward(keyword.count)
            self.paster.paste(text, cursorFromEnd: expansion["cursorFromEnd"] as? Int ?? 0)
        }
    }
}

private func snippetTapCallback(
    proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, userInfo: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    if let userInfo {
        Unmanaged<SnippetExpander>.fromOpaque(userInfo).takeUnretainedValue().handle(type: type, event: event)
    }
    return Unmanaged.passUnretained(event)
}
