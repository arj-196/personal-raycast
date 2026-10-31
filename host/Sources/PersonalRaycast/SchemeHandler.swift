import AppKit
import UniformTypeIdentifiers
import WebKit

/// Serves the built frontend at prc://localhost/… and app icons at prc://localhost/__icon?path=…&size=….
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL?
    private let iconCache = NSCache<NSString, NSData>()

    init(root: URL?) {
        self.root = root?.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return fail(task, 400) }
        if url.path == "/__icon" { return serveIcon(task, url) }
        guard let root else { return fail(task, 404) }

        let relative = url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(relative).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else { return fail(task, 404) }
        let mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        respond(task, data, mime: file.pathExtension == "js" ? "text/javascript" : mime)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func serveIcon(_ task: WKURLSchemeTask, _ url: URL) {
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard let path = query.first(where: { $0.name == "path" })?.value else { return fail(task, 400) }
        let size = min(max(Int(query.first(where: { $0.name == "size" })?.value ?? "") ?? 64, 16), 512)
        let key = "\(size):\(path)" as NSString

        if let cached = iconCache.object(forKey: key) {
            return respond(task, cached as Data, mime: "image/png", cacheable: true)
        }
        guard let png = Self.renderIcon(path: path, size: size) else { return fail(task, 404) }
        iconCache.setObject(png as NSData, forKey: key)
        respond(task, png, mime: "image/png", cacheable: true)
    }

    private static func renderIcon(path: String, size: Int) -> Data? {
        let icon = NSWorkspace.shared.icon(forFile: path)
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
            hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
        ) else { return nil }
        rep.size = NSSize(width: size, height: size)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        icon.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
        NSGraphicsContext.restoreGraphicsState()
        return rep.representation(using: .png, properties: [:])
    }

    private func respond(_ task: WKURLSchemeTask, _ data: Data, mime: String, cacheable: Bool = false) {
        var headers = ["Content-Type": mime, "Content-Length": String(data.count), "Access-Control-Allow-Origin": "*"]
        if cacheable { headers["Cache-Control"] = "max-age=3600" }
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
