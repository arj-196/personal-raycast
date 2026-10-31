import Foundation

/// Where the frontend and backend come from: bundled resources, or dev overrides from the environment.
struct AppConfig {
    /// Page loaded into the web view (prc://localhost/index.html, or a Vite dev server).
    let frontendURL: URL
    /// Directory served under prc://localhost/ (nil when using a dev server).
    let frontendRoot: URL?
    let backendCommand: [String]

    static func resolve(environment: [String: String] = ProcessInfo.processInfo.environment) -> AppConfig {
        let resources = Bundle.main.resourceURL ?? URL(fileURLWithPath: FileManager.default.currentDirectoryPath)

        let frontendRoot = environment["PRC_FRONTEND_DIR"].map { URL(fileURLWithPath: $0) } ?? resources.appendingPathComponent("frontend")
        let frontendURL = environment["PRC_FRONTEND_URL"].flatMap(URL.init(string:)) ?? URL(string: "prc://localhost/index.html")!

        // PRC_BACKEND_CMD="bun run /path/to/backend/src/index.ts" for development.
        let backendCommand = environment["PRC_BACKEND_CMD"].map { ["/bin/sh", "-c", "exec \($0)"] }
            ?? [resources.appendingPathComponent("prc-backend").path]

        return AppConfig(
            frontendURL: frontendURL,
            frontendRoot: environment["PRC_FRONTEND_URL"] == nil ? frontendRoot : nil,
            backendCommand: backendCommand
        )
    }
}
