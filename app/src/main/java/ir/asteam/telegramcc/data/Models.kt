// =============================================================================
// data/Models.kt
// مدل‌های داده‌ای بین API، ViewModel و UI.
// مدل‌ها عمداً هیچ Secret مثل bot_token یا service_role ندارند.
// =============================================================================
package ir.asteam.telegramcc.data

/** اطلاعات عمومی فروشگاهی که اپ به آن Pair شده است. */
data class Merchant(
    val id: String,
    val storeName: String,
    val botUsername: String,
    val botFirstName: String,
    val mandatoryChannel: String,
    val reportChannel: String,
    val supportLink: String,
    val referralPercent: Double,
    val cardNumber: String,
    val cardHolderName: String,
    val createdAt: String,
)

/** آمار خلاصه داشبورد. */
data class Dashboard(
    val customersCount: Int = 0,
    val productsCount: Int = 0,
    val ordersCount: Int = 0,
    val sales30Days: Long = 0L,
)

/** دسته‌بندی محصول. */
data class Category(
    val id: String,
    val name: String,
    val isActive: Boolean,
    val sortOrder: Int,
)

/** محصول قابل مدیریت از اپ. */
data class Product(
    val id: String,
    val categoryId: String?,
    val name: String,
    val description: String,
    val price: Long,
    val isActive: Boolean,
    val createdAt: String,
)

/** سفارش فروشگاه با اطلاعات خلاصه مشتری. */
data class Order(
    val id: String,
    val status: String,
    val totalAmount: Long,
    val phone: String,
    val address: String,
    val deliveryMethod: String,
    val createdAt: String,
    val customerName: String,
    val customerUsername: String,
)

/** پاسخ Pairing؛ توکن نشست فقط همان لحظه دریافت و بعد رمز‌شده ذخیره می‌شود. */
data class PairResult(
    val sessionToken: String,
    val expiresAt: String,
    val merchant: Merchant,
)

/** اطلاعات عمومی نسخهٔ جدید از Worker. */
data class VersionInfo(
    val latestVersionCode: Int,
    val latestVersionName: String,
    val downloadUrl: String,
    val forceUpdate: Boolean,
)
