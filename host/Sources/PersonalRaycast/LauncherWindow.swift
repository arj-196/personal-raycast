import AppKit
import WebKit

/// Borderless, non-activating panel: it takes keyboard focus without activating the app, so the
/// previously focused app stays frontmost and can receive pastes.
final class LauncherPanel: NSPanel {
    init(size: NSSize) {
        super.init(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        level = .floating
        isFloatingPanel = true
        hidesOnDeactivate = false
        isMovableByWindowBackground = true
        backgroundColor = .clear
        isOpaque = false
        hasShadow = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class LauncherWindow: NSObject, NSWindowDelegate {
    static let size = NSSize(width: 750, height: 475)

    let bridge: WebBridge
    private let panel = LauncherPanel(size: LauncherWindow.size)
    private let webView: WKWebView
    private var hiddenAt = Date.distantPast

    init(config: AppConfig, backend: Backend) {
        bridge = WebBridge(backend: backend)
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(SchemeHandler(root: config.frontendRoot), forURLScheme: "prc")
        configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "ipcRequest")
        webView = WKWebView(frame: NSRect(origin: .zero, size: Self.size), configuration: configuration)
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        webView.isInspectable = true
        webView.autoresizingMask = [.width, .height]
        super.init()

        let background = NSVisualEffectView(frame: NSRect(origin: .zero, size: Self.size))
        background.material = .popover
        background.blendingMode = .behindWindow
        background.state = .active
        background.maskImage = Self.roundedMask(radius: 12)
        background.addSubview(webView)
        panel.contentView = background
        panel.delegate = self

        // Load now so the first ⌥Space is instant.
        webView.load(URLRequest(url: config.frontendURL))
    }

    var isVisible: Bool { panel.isVisible }

    func toggle() {
        isVisible ? hide() : show()
    }

    func show() {
        guard !panel.isVisible else { return panel.makeKey() }
        positionOnActiveScreen()
        let hiddenFor = min(Date().timeIntervalSince(hiddenAt), 1e9)
        // Cooperative `activate()` is refused when another app hasn't yielded (e.g. `open` from a
        // terminal), which leaves the panel to lose key and hide itself. Force it, like launchers do.
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(webView)
        notifyFrontend("raycast.mainWindowShown", ["hiddenForSeconds": hiddenFor])
    }

    /// Hiding the app (not just the panel) makes macOS reactivate whichever app was frontmost
    /// before, so pastes and typing land there.
    func hide() {
        guard panel.isVisible else { return }
        panel.orderOut(nil)
        hiddenAt = Date()
        if NSApp.isActive { NSApp.hide(nil) }
    }

    func notifyFrontend(_ method: String, _ params: Any) {
        webView.evaluateJavaScript("window.ipcNotification?.(\(JSON.string(method)), \(JSON.string(params)))")
    }

    /// UI-testing only (PRC_UI_TESTING=1): runs an async JS body in the page and returns its value.
    func evaluateForTesting(_ body: String, completion: @escaping (String) -> Void) {
        webView.callAsyncJavaScript(body, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case let .success(value): completion(JSON.string(["ok": value]))
            case let .failure(error): completion(JSON.string(["error": error.localizedDescription]))
            }
        }
    }

    /// Key status bounces between our own windows while the app activates (e.g. right after `open`),
    /// so only hide once focus has actually left the app. The app-level case is `appDidResignActive`.
    func windowDidResignKey(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            if !NSApp.isActive { self?.hide() }
        }
    }

    func appDidResignActive() {
        hide()
    }

    private func positionOnActiveScreen() {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        guard let visible = screen?.visibleFrame else { return }
        let origin = NSPoint(
            x: visible.midX - Self.size.width / 2,
            y: visible.midY - Self.size.height / 2 + visible.height * 0.12
        )
        panel.setFrameOrigin(origin)
    }

    private static func roundedMask(radius: CGFloat) -> NSImage {
        let edge = radius * 2 + 1
        let image = NSImage(size: NSSize(width: edge, height: edge), flipped: false) { rect in
            NSColor.black.setFill()
            NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
            return true
        }
        image.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
        image.resizingMode = .stretch
        return image
    }
}
