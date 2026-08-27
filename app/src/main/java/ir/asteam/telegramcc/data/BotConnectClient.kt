// =============================================================================
// data/BotConnectClient.kt
// کلاینت بسیار محدود صفحهٔ ورود اولیه با BotFather Token.
//
// این کلاس فقط یک کار انجام می‌دهد: Token را یک‌بار از طریق HTTPS به Backend
// رسمی پروژه می‌فرستد و Session اپ را تحویل می‌گیرد. Token در SharedPreferences،
// Log یا فایل محلی ذخیره نمی‌شود و بعد از پایان درخواست دیگر موردنیاز APK نیست.
// =============================================================================
package ir.asteam.telegramcc.data

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** اتصال یک‌باره ربات به Backend و دریافت Session امن اپ. */
class BotConnectClient(baseUrl: String) {

    // آدرس Backend داخل BuildConfig قرار دارد و کاربر آن را وارد نمی‌کند.
    private val normalizedBaseUrl = baseUrl.trim().trimEnd('/')

    /**
     * BotFather Token را برای اعتبارسنجی و ساخت/بازیابی Merchant ارسال می‌کند.
     * خود Token در هیچ متغیر پایدار یا خروجی API قرار نمی‌گیرد.
     */
    fun connect(botToken: String, deviceName: String): PairResult {
        val connection = (URL("$normalizedBaseUrl/api/v1/app/connect-bot").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Cache-Control", "no-store")
        }

        val requestBody = JSONObject()
            .put("botToken", botToken.trim())
            .put("deviceName", deviceName.take(120))
            .toString()

        connection.outputStream.use { output ->
            output.write(requestBody.toByteArray(Charsets.UTF_8))
        }

        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        connection.disconnect()

        val json = runCatching { JSONObject(responseText) }.getOrElse {
            throw ApiException("پاسخ سرور قابل خواندن نیست.", status)
        }

        if (status !in 200..299) {
            val message = json.optJSONObject("error")?.optString("message")
                ?.takeIf { it.isNotBlank() }
                ?: "اتصال ربات ناموفق بود."
            throw ApiException(message, status)
        }

        val merchantJson = json.getJSONObject("merchant")
        return PairResult(
            sessionToken = json.getString("sessionToken"),
            expiresAt = json.getString("expiresAt"),
            merchant = Merchant(
                id = merchantJson.getString("id"),
                storeName = merchantJson.optString("storeName", "فروشگاه"),
                botUsername = merchantJson.optString("botUsername", ""),
                botFirstName = merchantJson.optString("botFirstName", ""),
                mandatoryChannel = merchantJson.optString("mandatoryChannel", ""),
                reportChannel = merchantJson.optString("reportChannel", ""),
                supportLink = merchantJson.optString("supportLink", ""),
                referralPercent = merchantJson.optDouble("referralPercent", 0.0),
                cardNumber = merchantJson.optString("cardNumber", ""),
                cardHolderName = merchantJson.optString("cardHolderName", ""),
                createdAt = merchantJson.optString("createdAt", ""),
            ),
        )
    }
}
