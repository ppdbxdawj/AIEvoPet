// aievopet-ocr — Vision-based text recognition for AIEvoPet's Screen
// Awareness feature. Reads a PNG path on argv[1] and prints recognised
// text lines to stdout (one per line, no padding). Exit codes:
//   0  success — stdout may be empty if no text was found
//   1  bad usage (missing path)
//   2  could not load image at path
//   3  OCR request failed
//
// Lives as plain source in src-tauri/swift/ so the Rust side can embed
// it via include_str! and compile on first run with `swiftc`. This
// avoids a build.rs Swift toolchain dance, cross-compilation surface,
// and Tauri sidecar plugin setup. The trade-off is a one-time ~3s
// compile on first invocation; the result is cached in <data_dir>.

import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    FileHandle.standardError.write("aievopet-ocr: usage: aievopet-ocr <path/to/image.png>\n".data(using: .utf8)!)
    exit(1)
}

let path = CommandLine.arguments[1]

guard let nsImage = NSImage(contentsOfFile: path) else {
    FileHandle.standardError.write("aievopet-ocr: failed to load image at \(path)\n".data(using: .utf8)!)
    exit(2)
}

// NSImage may hold multiple representations; prefer the largest CGImage
// so OCR sees the highest-DPI version (Retina screencaptures double up).
guard let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("aievopet-ocr: failed to extract CGImage\n".data(using: .utf8)!)
    exit(2)
}

let semaphore = DispatchSemaphore(value: 0)
var exitCode: Int32 = 0

let request = VNRecognizeTextRequest { request, error in
    defer { semaphore.signal() }
    if let error = error {
        FileHandle.standardError.write("aievopet-ocr: \(error.localizedDescription)\n".data(using: .utf8)!)
        exitCode = 3
        return
    }
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        return
    }
    let stdout = FileHandle.standardOutput
    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let line = candidate.string
        // Skip whitespace-only fragments — they tend to be Vision artefacts
        // around UI dividers and just dilute the LLM's eventual context.
        if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
        stdout.write((line + "\n").data(using: .utf8)!)
    }
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
// Targeting the user's most likely environments. Vision auto-detects from
// this list and falls back to en-US when the screen content doesn't match.
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US", "ja-JP"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    FileHandle.standardError.write("aievopet-ocr: \(error.localizedDescription)\n".data(using: .utf8)!)
    exit(3)
}

semaphore.wait()
exit(exitCode)
