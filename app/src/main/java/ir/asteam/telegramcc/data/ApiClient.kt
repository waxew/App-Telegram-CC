// =============================================================================
// data/ApiClient.kt
// کلاینت شبکهٔ سبک برای REST API بک‌اند؛ بدون وابستگی شبکه‌ای شخص ثالث.
// =============================================================================
package ir.asteam.telegramcc.data

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** خطای قابل‌نمایش API با HTTP status و پیام سرور. */
class ApiException(
    message: String,
    val statusCode: Int,
) : Exception(message)

/**
 * تمام درخواست‌ها فقط به Worker HTTPS ارسال می‌شوند.
 * service_role و bot token هیچ‌وقت در این کلاس یا APK قرار نمی‌گیرند.
 */
class ApiClient(
    baseUrl: String,
    private val sessionToken: String? = null,
) {
    // Slash انتهایی حذف می‌شود تا ساخت URL دوبل نشود.
    private val normalizedBaseUrl = baseUrl.trim().trimEnd('/')

    /** Pairing عمومی با کد یک‌بارمصرف. */
    fun pair(code: String, deviceName: String): PairResult {
        val body = JSONObject()
            .put("code", code.trim().uppercase())
            .put("deviceName", deviceName.take(120))
        val json = request("POST", "/api/v1/app/pair", body)
        return PairResult(
            sessionToken = json.getString("sessionToken"),
            expiresAt = json.getString("expiresAt"),
            merchant = parseMerchant(json.getJSONObject("merchant")),
        )
    }

    /** بررسی Session و دریافت اطلاعات فروشگاه. */
    fun me(): Merchant {
        val json = request("GET", "/api/v1/app/me")
        return parseMerchant(json.getJSONObject("merchant"))
    }

    /** لغو Session در سرور. */
    fun logout() {
        request("POST", "/api/v1/app/logout", JSONObject())
    }

    /** دریافت آمار داشبورد. */
    fun dashboard(): Dashboard {
        val root = request("GET", "/api/v1/dashboard")
        val json = root.getJSONObject("dashboard")
        return Dashboard(
            customersCount = json.optInt("customersCount", 0),
            productsCount = json.optInt("productsCount", 0),
            ordersCount = json.optInt("ordersCount", 0),
            sales30Days = json.optLong("sales30Days", 0L),
        )
    }

    /** دریافت دسته‌بندی‌ها برای نمایش/ساخت محصول. */
    fun categories(): List<Category> {
        val array = request("GET", "/api/v1/categories").optJSONArray("categories") ?: JSONArray()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                add(
                    Category(
                        id = item.getString("id"),
                        name = item.optString("name"),
                        isActive = item.optBoolean("is_active", true),
                        sortOrder = item.optInt("sort_order", 0),
                    )
                )
            }
        }
    }

    /** دریافت آخرین محصولات فروشگاه. */
    fun products(): List<Product> {
        val array = request("GET", "/api/v1/products").optJSONArray("products") ?: JSONArray()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                add(
                    Product(
                        id = item.getString("id"),
                        categoryId = item.optNullableString("category_id"),
                        name = item.optString("name_fa", item.optString("name_en", "محصول")),
                        description = item.optString("description", ""),
                        price = item.optLong("price", 0L),
                        isActive = item.optBoolean("is_active", true),
                        createdAt = item.optString("created_at", ""),
                    )
                )
            }
        }
    }

    /** ساخت محصول ساده؛ ویرایش جزئیات بیشتر در فاز بعد به همین API متصل می‌شود. */
    fun createProduct(name: String, price: Long, description: String): Product {
        val body = JSONObject()
            .put("name", name.trim())
            .put("price", price)
            .put("description", description.trim())
        val root = request("POST", "/api/v1/products", body)
        val item = root.getJSONObject("product")
        return Product(
            id = item.getString("id"),
            categoryId = item.optNullableString("category_id"),
            name = item.optString("name_fa", item.optString("name_en", "محصول")),
            description = item.optString("description", ""),
            price = item.optLong("price", 0L),
            isActive = item.optBoolean("is_active", true),
            createdAt = item.optString("created_at", ""),
        )
    }

    /** فعال/غیرفعال کردن سریع محصول. */
    fun setProductActive(productId: String, active: Boolean) {
        request(
            "PATCH",
            "/api/v1/products/$productId",
            JSONObject().put("isActive", active),
        )
    }

    /** دریافت سفارش‌ها. */
    fun orders(): List<Order> {
        val array = request("GET", "/api/v1/orders").optJSONArray("orders") ?: JSONArray()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                add(
                    Order(
                        id = item.getString("id"),
                        status = item.optString("status", "pending"),
                        totalAmount = item.optLong("totalAmount", 0L),
                        phone = item.optString("phone", ""),
                        address = item.optString("address", ""),
                        deliveryMethod = item.optString("deliveryMethod", ""),
                        createdAt = item.optString("createdAt", ""),
                        customerName = item.optString("customerName", ""),
                        customerUsername = item.optString("customerUsername", ""),
                    )
                )
            }
        }
    }

    /** تغییر وضعیت سفارش با لیست وضعیت‌های کنترل‌شده در Backend. */
    fun updateOrderStatus(orderId: String, status: String) {
        request(
            "PATCH",
            "/api/v1/orders/$orderId/status",
            JSONObject().put("status", status),
        )
    }

    /** ذخیره تنظیمات عمومی فروشگاه. */
    fun updateSettings(merchant: Merchant): Merchant {
        val body = JSONObject()
            .put("storeName", merchant.storeName)
            .put("mandatoryChannel", merchant.mandatoryChannel)
            .put("reportChannel", merchant.reportChannel)
            .put("supportLink", merchant.supportLink)
            .put("referralPercent", merchant.referralPercent)
        val root = request("PATCH", "/api/v1/settings", body)
        return parseMerchant(root.getJSONObject("merchant"))
    }

    /** Route عمومی کنترل نسخه؛ Session لازم ندارد. */
    fun version(): VersionInfo {
        val root = request("GET", "/api/v1/app/version")
        return VersionInfo(
            latestVersionCode = root.optInt("latestVersionCode", 1),
            latestVersionName = root.optString("latestVersionName", "1.0.0"),
            downloadUrl = root.optString("downloadUrl", ""),
            forceUpdate = root.optBoolean("forceUpdate", false),
        )
    }

    /**
     * اجرای مشترک HTTP.
     * اگر پاسخ ok=false باشد، پیام کنترل‌شده Backend به ApiException تبدیل می‌شود.
     */
    private fun request(method: String, path: String, body: JSONObject? = null): JSONObject {
        require(normalizedBaseUrl.startsWith("https://")) {
            "آدرس سرور باید با https:// شروع شود."
        }

        val connection = (URL(normalizedBaseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (!sessionToken.isNullOrBlank()) {
                setRequestProperty("Authorization", "Bearer $sessionToken")
            }
            if (body != null) doOutput = true
        }

        try {
            if (body != null) {
                connection.outputStream.use { stream ->
                    stream.write(body.toString().toByteArray(Charsets.UTF_8))
                }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val json = if (text.isBlank()) JSONObject() else JSONObject(text)

            if (status !in 200..299 || json.optBoolean("ok", true).not()) {
                val message = json.optJSONObject("error")?.optString("message")
                    ?.takeIf { it.isNotBlank() }
                    ?: "خطای ارتباط با سرور ($status)"
                throw ApiException(message, status)
            }

            return json
        } finally {
            connection.disconnect()
        }
    }

    /** Merchant JSON را به مدل امن و قابل استفاده UI تبدیل می‌کند. */
    private fun parseMerchant(json: JSONObject): Merchant = Merchant(
        id = json.optString("id"),
        storeName = json.optString("storeName", "فروشگاه"),
        botUsername = json.optString("botUsername", ""),
        botFirstName = json.optString("botFirstName", ""),
        mandatoryChannel = json.optString("mandatoryChannel", ""),
        reportChannel = json.optString("reportChannel", ""),
        supportLink = json.optString("supportLink", ""),
        referralPercent = json.optDouble("referralPercent", 0.0),
        cardNumber = json.optString("cardNumber", ""),
        cardHolderName = json.optString("cardHolderName", ""),
        createdAt = json.optString("createdAt", ""),
    )

    /** JSONObject.NULL را با null واقعی Kotlin جایگزین می‌کند. */
    private fun JSONObject.optNullableString(key: String): String? {
        if (!has(key) || isNull(key)) return null
        return optString(key).takeIf { it.isNotBlank() }
    }
}
