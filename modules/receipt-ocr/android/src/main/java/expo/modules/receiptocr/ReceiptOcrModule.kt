package expo.modules.receiptocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ReceiptOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("recognizeLines") { uriString: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw IllegalStateException("No React context")
        // Accepts file:// and content:// URIs, or a plain path.
        val uri = if (uriString.contains("://")) Uri.parse(uriString) else Uri.fromFile(File(uriString))
        val image = InputImage.fromFilePath(context, uri)

        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
          .process(image)
          .addOnSuccessListener { result ->
            // ML Kit's blocks come in no reliable order; return every line with its box so the
            // JS side can rebuild the receipt's rows.
            val lines = result.textBlocks.flatMap { block ->
              block.lines.mapNotNull { line ->
                val box = line.boundingBox ?: return@mapNotNull null
                mapOf(
                  "text" to line.text,
                  "x" to box.left.toDouble(),
                  "y" to box.top.toDouble(),
                  "width" to box.width().toDouble(),
                  "height" to box.height().toDouble(),
                  // ML Kit: degrees, clockwise (positive when the line runs down to the right).
                  "angle" to line.angle.toDouble(),
                )
              }
            }
            promise.resolve(lines)
          }
          .addOnFailureListener { error -> promise.reject(CodedException("ERR_OCR", error.message ?: "Text recognition failed", error)) }
      } catch (error: Exception) {
        promise.reject(CodedException("ERR_IMAGE", error.message ?: "Couldn't open the image", error))
      }
    }
  }
}
