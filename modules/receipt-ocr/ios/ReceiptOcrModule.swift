import ExpoModulesCore
import UIKit
import Vision

public class ReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("recognizeLines") { (url: URL, promise: Promise) in
      guard let data = try? Data(contentsOf: url), let image = UIImage(data: data), let cgImage = image.cgImage else {
        promise.reject("ERR_IMAGE", "Couldn't open the image at \(url)")
        return
      }

      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          promise.reject("ERR_OCR", error.localizedDescription)
          return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        // Vision boxes are normalised with the origin at the bottom-left; convert to pixels with
        // the origin at the top-left, like Android.
        let w = CGFloat(cgImage.width)
        let h = CGFloat(cgImage.height)
        let lines: [[String: Any]] = observations.compactMap { observation in
          guard let text = observation.topCandidates(1).first?.string else { return nil }
          let box = observation.boundingBox
          let dx = (observation.topRight.x - observation.topLeft.x) * w
          let dy = (observation.topLeft.y - observation.topRight.y) * h
          return [
            "text": text,
            "x": box.minX * w,
            "y": (1 - box.maxY) * h,
            "width": box.width * w,
            "height": box.height * h,
            "angle": atan2(dy, dx) * 180 / .pi,
          ]
        }
        promise.resolve(lines)
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let handler = VNImageRequestHandler(cgImage: cgImage, orientation: CGImagePropertyOrientation(image.imageOrientation))
          try handler.perform([request])
        } catch {
          promise.reject("ERR_OCR", error.localizedDescription)
        }
      }
    }
  }
}

private extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
