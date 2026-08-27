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

/**
 * مشتری ثبت‌شده در یک فروشگاه.
 * walletBalance فقط برای نمایش است؛ تغییر موجودی باید از گردش‌حساب مالی انجام شود.
 */
data class Customer(
    val id: String,
    val telegramId: Long,
    val firstName: String,
    val username: String,
    val phone: String,
    val address: String,
    val walletBalance: Long,
    val createdAt: String,
)

/** سفارش فروشگاه با اطلاعات خلاصه مشتری؛ مناسب فهرست سفارش‌ها. */
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

/**
 * یک قلم ثبت‌شده داخل سفارش.
 * نام و قیمت از Snapshot زمان خرید می‌آیند، نه از محصول فعلی؛ بنابراین تاریخچه
 * سفارش با تغییر نام یا قیمت محصول در آینده عوض نمی‌شود.
 */
data class OrderItem(
    val id: String,
    val productId: String?,
    val productName: String,
    val unitPrice: Long,
    val quantity: Int,
) {
    /** جمع همان ردیف = قیمت واحد × تعداد. */
    val lineTotal: Long
        get() = unitPrice * quantity.toLong()
}

/**
 * جزئیات کامل یک سفارش برای صفحه مدیریت.
 * این مدل علاوه بر اطلاعات ارسال، مبالغ قبل/بعد از تخفیف و ریز اقلام را نگه می‌دارد.
 */
data class OrderDetail(
    val id: String,
    val status: String,
    val subtotalAmount: Long,
    val discountAmount: Long,
    val totalAmount: Long,
    val phone: String,
    val address: String,
    val deliveryMethod: String,
    val createdAt: String,
    val customerName: String,
    val customerUsername: String,
    val items: List<OrderItem>,
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
