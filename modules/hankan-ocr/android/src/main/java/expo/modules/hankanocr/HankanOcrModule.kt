package expo.modules.hankanocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HankanOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HankanOcr")
    AsyncFunction("recognizeDetails") { path: String, enhanced: Boolean, latin: Boolean, promise: Promise ->
      var prepared: Bitmap? = null
      try {
        val context = appContext.reactContext ?: throw Exception("Application is not ready")
        val uri = Uri.parse(path)
        require(uri.scheme == "file" || uri.scheme == "content") { "Only local images are supported" }
        // JS normalizes EXIF orientation before this optional contrast pass.
        val image = if (enhanced) {
          val original = context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it) }
            ?: throw Exception("Could not decode image")
          val output = Bitmap.createBitmap(original.width, original.height, Bitmap.Config.ARGB_8888)
          prepared = output
          val gray = ColorMatrix().apply { setSaturation(0f) }
          val contrast = ColorMatrix(floatArrayOf(1.35f,0f,0f,0f,-30f, 0f,1.35f,0f,0f,-30f, 0f,0f,1.35f,0f,-30f, 0f,0f,0f,1f,0f))
          gray.postConcat(contrast)
          Canvas(output).drawBitmap(original, 0f, 0f, Paint().apply { colorFilter = ColorMatrixColorFilter(gray) })
          original.recycle()
          InputImage.fromBitmap(output, 0)
        } else InputImage.fromFilePath(context, uri)
        val recognizer = if (latin) TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
          else TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
        recognizer.process(image)
          .addOnSuccessListener { text ->
            val lines = text.textBlocks.flatMapIndexed { blockIndex, block -> block.lines.map { line ->
              val box = line.boundingBox
              mapOf("text" to line.text, "block" to blockIndex, "x" to (box?.left ?: 0), "y" to (box?.top ?: 0),
                "width" to (box?.width() ?: 0), "height" to (box?.height() ?: 0))
            } }
            promise.resolve(mapOf("text" to text.text, "lines" to lines))
          }
          .addOnFailureListener { error -> promise.reject("OCR_FAILED", "사진의 글자를 읽지 못했어요. 다시 촬영해 주세요.", error) }
          .addOnCompleteListener { recognizer.close(); prepared?.recycle() }
      } catch (error: Exception) {
        prepared?.recycle()
        promise.reject("OCR_FAILED", "사진을 처리하지 못했어요. 다른 사진을 선택해 주세요.", error)
      }
    }
  }
}
