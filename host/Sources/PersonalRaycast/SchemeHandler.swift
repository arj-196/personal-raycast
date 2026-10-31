import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the built frontend at prc://localhost/….
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL?

    init(root: URL?) {
        self.root = root?.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return fail(task, 400) }
        guard let root else { return fail(task, 404) }

        let relative = url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(relative).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else { return fail(task, 404) }
        let mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        respond(task, data, mime: file.pathExtension == "js" ? "text/javascript" : mime)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func respond(_ task: WKURLSchemeTask, _ data: Data, mime: String) {
        let headers = ["Content-Type": mime, "Content-Length": String(data.count), "Access-Control-Allow-Origin": "*"]
        let response = HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    private func fail(_ task: WKURLSchemeTask, _ status: Int) {
        let response = HTTPURLResponse(url: task.request.url ?? URL(string: "prc://localhost/")!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        task.didReceive(response)
        task.didFinish()
    }
}
