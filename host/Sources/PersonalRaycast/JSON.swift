import Foundation

enum JSON {
    static func data(_ value: Any) -> Data? {
        try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
    }

    static func string(_ value: Any) -> String {
        data(value).flatMap { String(data: $0, encoding: .utf8) } ?? "null"
    }

    static func parse(_ data: Data) -> Any? {
        try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
}

struct IPCError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

typealias Reply = (Result<Any, Error>) -> Void
