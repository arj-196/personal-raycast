import Carbon

/// System-wide hotkey via Carbon's RegisterEventHotKey (no Accessibility permission needed).
final class HotKey {
    private static var actions: [UInt32: () -> Void] = [:]
    private static var handlerInstalled = false
    private var reference: EventHotKeyRef?

    /// `keyCode` is a virtual key code (kVK_*), `modifiers` Carbon flags (optionKey, cmdKey, …).
    init?(keyCode: Int, modifiers: Int, action: @escaping () -> Void) {
        Self.installHandler()
        let id = EventHotKeyID(signature: OSType(0x5052_4331), id: UInt32(Self.actions.count + 1)) // "PRC1"
        let status = RegisterEventHotKey(UInt32(keyCode), UInt32(modifiers), id, GetApplicationEventTarget(), 0, &reference)
        guard status == noErr else {
            NSLog("RegisterEventHotKey failed (\(status)); is the shortcut taken?")
            return nil
        }
        Self.actions[id.id] = action
    }

    deinit {
        if let reference { UnregisterEventHotKey(reference) }
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
