import AppKit

/// `ipc.host.*` methods: things only the native shell can do.
final class HostHandlers {
    private let window: LauncherWindow
    private let paster: Paster
    private let hud: HUD

    init(window: LauncherWindow, paster: Paster, hud: HUD) {
        self.window = window
        self.paster = paster
        self.hud = hud
    }

    func handle(_ method: String, _ params: Any, reply: @escaping Reply) {
        let params = params as? [String: Any] ?? [:]
        switch method {
        case "raycast.showMainWindow":
            window.show()
        case "raycast.hideMainWindow":
            window.hide()
            if let text = params["hud"] as? String { hud.show(text) }
        case "raycast.pasteText":
            guard let text = params["text"] as? String else { return reply(.failure(IPCError(message: "text is required"))) }
            window.hide()
            if !paster.paste(text, cursorFromEnd: params["cursorFromEnd"] as? Int ?? 0) {
                hud.show("Copied to Clipboard — allow Accessibility to paste")
            }
        case "raycast.quit":
            reply(.success(NSNull()))
            DispatchQueue.main.async { NSApp.terminate(nil) }
            return
        default:
            return reply(.failure(IPCError(message: "Unknown host method: \(method)")))
        }
        reply(.success(NSNull()))
    }
}
