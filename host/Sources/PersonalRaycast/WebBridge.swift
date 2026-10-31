import WebKit

/// Receives `webkit.messageHandlers.ipcRequest.postMessage({method, destination, data})` from the
/// frontend and routes it to the host or the backend. Replies with JSON `{data}` or an error string.
final class WebBridge: NSObject, WKScriptMessageHandlerWithReply {
    private let backend: Backend
    var host: HostHandlers?

    init(backend: Backend) {
        self.backend = backend
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let body = message.body as? [String: Any], let method = body["method"] as? String else {
            return replyHandler(nil, "Malformed IPC request")
        }
        let params = (body["data"] as? String).flatMap { JSON.parse(Data($0.utf8)) } ?? [String: Any]()
        let complete: Reply = { result in
            switch result {
            case let .success(value): replyHandler(JSON.string(["data": value]), nil)
            case let .failure(error): replyHandler(nil, error.localizedDescription)
            }
        }

        if body["destination"] as? String == "host" {
            guard let host else { return complete(.failure(IPCError(message: "Host not ready"))) }
            host.handle(method, params, reply: complete)
        } else {
            backend.request(method, params, reply: complete)
        }
    }
}
