import AppKit
import Carbon

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var backend: Backend!
    private var window: LauncherWindow!
    private var expander: SnippetExpander!
    private var hotKey: HotKey?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = AppConfig.resolve()
        let paster = Paster()
        backend = Backend(command: config.backendCommand)
        window = LauncherWindow(config: config, backend: backend)
        let host = HostHandlers(window: window, paster: paster, hud: HUD())
        window.bridge.host = host
        expander = SnippetExpander(backend: backend, paster: paster, isSuspended: { [weak self] in self?.window.isVisible ?? false })

        backend.onRequest = { method, params, reply in host.handle(method, params, reply: reply) }
        backend.onNotification = { [weak self] method, params in
            guard let self else { return }
            self.window.notifyFrontend(method, params)
            if method == "snippets.keywordsChanged", let keywords = (params as? [String: Any])?["keywords"] as? [String] {
                self.expander.update(keywords: keywords)
            }
        }
        backend.onStart = { [weak self] in
            self?.backend.request("snippets.keywords", [String: Any]()) { result in
                if case let .success(value) = result, let keywords = value as? [String] { self?.expander.update(keywords: keywords) }
            }
        }
        backend.start()

        hotKey = HotKey(keyCode: kVK_Space, modifiers: optionKey) { [weak self] in self?.window.toggle() }
        installStatusItem()

        // Opening the app by hand should show the launcher; --hidden is for future launch-at-login.
        if !CommandLine.arguments.contains("--hidden") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.window.show() }
        }
        if ProcessInfo.processInfo.environment["PRC_UI_TESTING"] == "1" { installUITestingHook() }
    }

    /// Another app took focus: dismiss the launcher, like Raycast.
    func applicationDidResignActive(_ notification: Notification) {
        window.appDidResignActive()
    }

    /// `open` / double-click while already running.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.show()
        return false
    }

    /// Drives the web UI without synthesizing system keystrokes: a distributed notification carries a
    /// JS body to evaluate, and the JSON result is written to the path in its userInfo["out"].
    private func installUITestingHook() {
        DistributedNotificationCenter.default().addObserver(
            forName: Notification.Name("com.arjun.personal-raycast.uitest"), object: nil, queue: .main
        ) { [weak self] note in
            guard let script = note.object as? String, let out = note.userInfo?["out"] as? String else { return }
            self?.window.evaluateForTesting(script) { result in
                try? result.write(toFile: out, atomically: true, encoding: .utf8)
            }
        }
        NSLog("UI testing hook installed")
    }

    func applicationWillTerminate(_ notification: Notification) {
        backend.stop()
    }

    private func installStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "command", accessibilityDescription: "Personal Raycast")
        let menu = NSMenu()
        menu.addItem(withTitle: "Open Personal Raycast", action: #selector(openLauncher), keyEquivalent: " ").keyEquivalentModifierMask = [.option]
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.items.first?.target = self
        item.menu = menu
        statusItem = item
    }

    @objc private func openLauncher() {
        window.show()
    }
}
