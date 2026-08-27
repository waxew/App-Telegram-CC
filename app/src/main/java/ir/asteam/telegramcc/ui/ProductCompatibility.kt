// =============================================================================
// ui/ProductCompatibility.kt
// پل سازگاری موقت برای فرم قدیمی محصول که هنوز در TelegramCcApp.kt تعریف شده است.
//
// صفحه جدید ProductManagementScreen از امضای کامل createProduct با categoryId
// استفاده می‌کند. تا زمان حذف کامل Composable قدیمی، این Extension فراخوانی سه
// پارامتری قدیمی را به نسخه جدید با categoryId=null هدایت می‌کند تا Build نشکند.
// =============================================================================
package ir.asteam.telegramcc.ui

/**
 * سازگاری موقت با فراخوانی قدیمی createProduct(name, price, description).
 * محصولی که از فرم قدیمی ساخته شود بدون دسته‌بندی ثبت می‌شود.
 */
internal fun AppViewModel.createProduct(
    name: String,
    price: Long,
    description: String,
) {
    // متد عضو چهارپارامتری اولویت دارد و این فراخوانی بازگشتی به Extension نیست.
    createProduct(
        name = name,
        price = price,
        description = description,
        categoryId = null,
    )
}
