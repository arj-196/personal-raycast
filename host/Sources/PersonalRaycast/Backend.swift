import Foundation

/// Spawns and supervises the Bun backend, speaking newline-delimited JSON over its stdio
/// (docs/protocol.md). Plays the role of Raycast's Rust "Coordinator". Main-thread only.
final class Backend {
    var onNotification: ((String, Any) -> Void)?
    /// Backend → host requests.
    var onRequest: ((String, Any, @escaping Reply) -> Void)?
    /// Called after each (re)start, e.g. to resync state the host caches.
    var onStart: (() -> Void)?

    private let command: [String]
    private var process: Process?
    private var input: FileHandle?
    private var buffer = Data()
    private var nextId = 0
    private var pending: [String: Reply] = [:]
    private var stopping = false
    private var restartDelay: TimeInterval = 0.5

    init(command: [String]) {
        self.command = command
    }

    func start() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: command[0])
        process.arguments = Array(command.dropFirst())
        let stdin = Pipe()
        let stdout = Pipe()
        process.standardInput = stdin
        process.standardOutput = stdout
        process.standardError = FileHandle.standardError

        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            DispatchQueue.main.async { self?.consume(chunk) }
        }
        process.terminationHandler = { [weak self] finished in
            DispatchQueue.main.async { self?.didTerminate(status: finished.terminationStatus) }
        }

        do {
            try process.run()
        } catch {
            NSLog("Failed to start backend \(command): \(error.localizedDescription)")
            scheduleRestart()
            return
        }
        self.process = process
        input = stdin.fileHandleForWriting
        onStart?()
    }

    func stop() {
        stopping = true
        try? input?.close()
        process?.terminate()
    }

    func request(_ method: String, _ params: Any, reply: @escaping Reply) {
        nextId += 1
        let id = "h\(nextId)"
        pending[id] = reply
        if !send(["kind": "request", "id": id, "method": method, "params": params]) {
            pending.removeValue(forKey: id)
            reply(.failure(IPCError(message: "Backend is not running")))
        }
    }

    // MARK: - Private

    @discardableResult
    private func send(_ message: [String: Any]) -> Bool {
        guard let input, var data = JSON.data(message) else { return false }
        data.append(0x0A)
        do {
            try input.write(contentsOf: data)
            return true
        } catch {
            return false
        }
    }

    private func consume(_ chunk: Data) {
        restartDelay = 0.5 // it is talking, so it is healthy again
        buffer.append(chunk)
        while let newline = buffer.firstIndex(of: 0x0A) {
            let line = buffer[buffer.startIndex..<newline]
            buffer.removeSubrange(buffer.startIndex...newline)
            guard !line.isEmpty, let message = JSON.parse(Data(line)) as? [String: Any] else { continue }
            handle(message)
        }
    }

    private func handle(_ message: [String: Any]) {
        switch message["kind"] as? String {
        case "result":
            guard let id = message["id"] as? String, let reply = pending.removeValue(forKey: id) else { return }
            if let error = message["error"] as? [String: Any] {
                reply(.failure(IPCError(message: error["message"] as? String ?? "Backend error")))
            } else {
                reply(.success(message["result"] ?? NSNull()))
            }
        case "notify":
            guard let method = message["method"] as? String else { return }
            onNotification?(method, message["params"] ?? NSNull())
        case "request":
            guard let id = message["id"] as? String, let method = message["method"] as? String else { return }
            let respond: Reply = { [weak self] result in
                switch result {
                case let .success(value): self?.send(["kind": "result", "id": id, "result": value])
                case let .failure(error): self?.send(["kind": "result", "id": id, "error": ["message": error.localizedDescription]])
                }
            }
            if let onRequest { onRequest(method, message["params"] ?? NSNull(), respond) } else { respond(.failure(IPCError(message: "No host handler"))) }
        default:
            break
        }
    }

    private func didTerminate(status: Int32) {
        process = nil
        input = nil
        buffer.removeAll()
        let failed = pending
        pending.removeAll()
        failed.values.forEach { $0(.failure(IPCError(message: "Backend exited (\(status))"))) }
        guard !stopping else { return }
        NSLog("Backend exited with status \(status); restarting")
        scheduleRestart()
    }

    private func scheduleRestart() {
        let delay = restartDelay
        restartDelay = min(restartDelay * 2, 30)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, !self.stopping, self.process == nil else { return }
            self.start()
        }
    }
}
