// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "PersonalRaycast",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "PersonalRaycast",
            path: "Sources/PersonalRaycast",
            linkerSettings: [.linkedFramework("Carbon"), .linkedFramework("WebKit")]
        ),
    ]
)
