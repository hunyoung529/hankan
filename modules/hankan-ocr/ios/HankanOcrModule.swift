import ExpoModulesCore
import Vision
import ImageIO
import CoreImage

public class HankanOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HankanOcr")
    AsyncFunction("recognizeDetails") { (uri: String, enhanced: Bool, latin: Bool) -> [String: Any] in
      guard let url = URL(string: uri), url.isFileURL else {
        throw NSError(domain: "HankanOcr", code: 1, userInfo: [NSLocalizedDescriptionKey: "Only local images are supported"])
      }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = false
      request.minimumTextHeight = 0.003
      let supported = try request.supportedRecognitionLanguages()
      request.recognitionLanguages = ["ko-KR", "en-US"].filter { supported.contains($0) }
      let handler: VNImageRequestHandler
      if enhanced, let image = CIImage(contentsOf: url) {
        let adjusted = image.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0, kCIInputContrastKey: 1.35])
        handler = VNImageRequestHandler(ciImage: adjusted, options: [:])
      } else {
        handler = VNImageRequestHandler(url: url, options: [:])
      }
      try handler.perform([request])
      let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return ["text": candidate.string, "x": box.minX * 1000, "y": (1 - box.maxY) * 1000,
                "width": box.width * 1000, "height": box.height * 1000]
      }
      return ["text": lines.compactMap { $0["text"] as? String }.joined(separator: "\n"), "lines": lines]
    }
  }
}
