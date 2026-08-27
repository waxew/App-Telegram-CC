// =============================================================================
// ui/AppViewModel.kt
// State و عملیات اصلی اپ: Pairing، بازیابی نشست، داشبورد، محصولات و سفارش‌ها.
// =============================================================================
package ir.asteam.telegramcc.ui

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ir.asteam.telegramcc.BuildConfig
import ir.asteam.telegramcc.data.ApiClient
import ir.asteam.telegramcc.data.Category
import ir.asteam.telegramcc.data.Customer
import ir.asteam.telegramcc.data.Dashboard
import ir.asteam.telegramcc.data.Merchant
import ir.asteam.telegramcc.data.Order
import ir.asteam.telegramcc.data.OrderDetail
import ir.asteam.telegramcc.data.Product
import ir.asteam.telegramcc.data.SecurePreferences
import ir.asteam.telegramcc.data.VersionInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Screenهای اصلی برنامه؛ Navigation سبک و بدون dependency اضافی انجام می‌شود. */
enum class AppRoute {
    Pair,
    Dashboard,
    Categories,
    Products,
    Customers,
    Orders,
    OrderDetail,
    Settings,
    AboutUs,
    ContactUs,
    AboutApp,
}

/** State یکتای UI؛ هر تغییر باعث Recompose هدفمند می‌شود. */
data class AppUiState(
    val route: AppRoute = AppRoute.Pair,
    val loading: Boolean = true,
    val merchant: Merchant? = null,
    val dashboard: Dashboard = Dashboard(),
    val categories: List<Category> = emptyList(),
    val products: List<Product> = emptyList(),
    val customers: List<Customer> = emptyList(),
    val orders: List<Order> = emptyList(),
    val orderDetail: OrderDetail? = null,
    val errorMessage: String? = null,
    val infoMessage: String? = null,
    val versionInfo: VersionInfo? = null,
    val notificationsEnabled: Boolean = true,
    val baseUrl: String = "",
)

/** ViewModel سطح اپلیکیشن. */
class AppViewModel(application: Application) : AndroidViewModel(application) {

    // Wrapper امن تنظیمات محلی.
    private val preferences = SecurePreferences(application)

    // State داخلی فقط از ViewModel قابل تغییر است.
    private val _state = MutableStateFlow(
        AppUiState(
            loading = true,
            notificationsEnabled = preferences.notificationsEnabled,
            baseUrl = preferences.baseUrl,
        )
    )

    // UI فقط نسخه Read-only StateFlow را می‌بیند.
    val state: StateFlow<AppUiState> = _state.asStateFlow()

    init {
        // در شروع اپ، اگر نشست قبلی وجود دارد اعتبار آن بررسی می‌شود.
        restoreSession()
    }

    /** Pair کردن اپ با Worker از طریق کد یک‌بارمصرفی که ربات تولید کرده است. */
    fun pair(baseUrl: String, code: String) {
        if (!baseUrl.trim().startsWith("https://")) {
            showError("آدرس Worker باید با https:// شروع شود.")
            return
        }
        if (code.trim().length != 8) {
            showError("کد اتصال باید ۸ کاراکتر باشد.")
            return
        }

        runNetwork {
            _state.value = _state.value.copy(loading = true, errorMessage = null)
            val normalized = baseUrl.trim().trimEnd('/')
            val result = ApiClient(normalized).pair(
                code = code,
                deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
            )

            // URL غیرحساس و Session رمز‌شده روی دستگاه ذخیره می‌شوند.
            preferences.baseUrl = normalized
            preferences.saveSessionToken(result.sessionToken)

            // بعد از Pair، داده‌های صفحه اول از همان نشست دریافت می‌شوند.
            val authenticatedClient = ApiClient(normalized, result.sessionToken)
            val dashboard = authenticatedClient.dashboard()
            val version = runCatching { ApiClient(normalized).version() }.getOrNull()

            _state.value = _state.value.copy(
                route = AppRoute.Dashboard,
                loading = false,
                merchant = result.merchant,
                dashboard = dashboard,
                baseUrl = normalized,
                versionInfo = version,
                infoMessage = "اپ با فروشگاه متصل شد.",
            )
        }
    }

    /** رفتن به صفحه؛ داده‌های لازم همان صفحه قبل از نمایش Refresh می‌شوند. */
    fun navigate(route: AppRoute) {
        _state.value = _state.value.copy(route = route, errorMessage = null, infoMessage = null)
        when (route) {
            AppRoute.Dashboard -> refreshDashboard()
            AppRoute.Categories -> refreshCategories()
            AppRoute.Products -> refreshProducts()
            AppRoute.Customers -> refreshCustomers()
            AppRoute.Orders -> refreshOrders()
            else -> Unit
        }
    }

    /**
     * رفتار Back برنامه.
     * جزئیات سفارش یک سطح زیر فهرست سفارش‌هاست، بنابراین ابتدا به Orders برمی‌گردد؛
     * سایر صفحات فرعی مثل قبل به داشبورد برمی‌گردند.
     */
    fun navigateBack(): Boolean {
        val current = _state.value.route
        return when {
            current == AppRoute.OrderDetail -> {
                _state.value = _state.value.copy(route = AppRoute.Orders, orderDetail = null)
                true
            }
            current != AppRoute.Dashboard && current != AppRoute.Pair -> {
                _state.value = _state.value.copy(route = AppRoute.Dashboard)
                true
            }
            else -> false
        }
    }

    /** Refresh آمار صفحه اصلی. */
    fun refreshDashboard() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val dashboard = client.dashboard()
            val version = runCatching { ApiClient(preferences.baseUrl).version() }.getOrNull()
            _state.value = _state.value.copy(loading = false, dashboard = dashboard, versionInfo = version)
        }
    }

    /** Refresh فهرست دسته‌بندی‌های فروشگاه. */
    fun refreshCategories() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val categories = client.categories()
            _state.value = _state.value.copy(loading = false, categories = categories)
        }
    }

    /** ساخت دسته‌بندی و همگام‌سازی دوباره لیست با سرور. */
    fun createCategory(name: String) {
        if (name.isBlank()) {
            showError("نام دسته‌بندی را وارد کنید.")
            return
        }
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.createCategory(name)
            val categories = client.categories()
            _state.value = _state.value.copy(
                loading = false,
                categories = categories,
                infoMessage = "دسته‌بندی اضافه شد.",
            )
        }
    }

    /** ویرایش نام و ترتیب نمایش دسته‌بندی. */
    fun updateCategory(category: Category, name: String, sortOrder: Int) {
        if (name.isBlank()) {
            showError("نام دسته‌بندی نمی‌تواند خالی باشد.")
            return
        }
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.updateCategory(
                categoryId = category.id,
                name = name,
                isActive = category.isActive,
                sortOrder = sortOrder,
            )
            val categories = client.categories()
            _state.value = _state.value.copy(
                loading = false,
                categories = categories,
                infoMessage = "دسته‌بندی ویرایش شد.",
            )
        }
    }

    /** فعال/غیرفعال کردن دسته‌بندی بدون حذف محصولات آن. */
    fun setCategoryActive(category: Category, active: Boolean) {
        runAuthenticated { client ->
            client.updateCategory(
                categoryId = category.id,
                name = category.name,
                isActive = active,
                sortOrder = category.sortOrder,
            )
            val categories = client.categories()
            _state.value = _state.value.copy(categories = categories)
        }
    }

    /** حذف دسته‌بندی و دریافت دوباره لیست برای نمایش نتیجه واقعی سرور. */
    fun deleteCategory(category: Category) {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.deleteCategory(category.id)
            val categories = client.categories()
            _state.value = _state.value.copy(
                loading = false,
                categories = categories,
                infoMessage = "دسته‌بندی حذف شد.",
            )
        }
    }

    /** Refresh هم‌زمان محصولات و دسته‌بندی‌ها برای نمایش فرم مدیریت کامل. */
    fun refreshProducts() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val categories = client.categories()
            val products = client.products()
            _state.value = _state.value.copy(
                loading = false,
                categories = categories,
                products = products,
            )
        }
    }

    /** ساخت محصول با دسته‌بندی اختیاری و Refresh لیست واقعی سرور. */
    fun createProduct(
        name: String,
        price: Long,
        description: String,
        categoryId: String?,
    ) {
        if (name.isBlank()) {
            showError("نام محصول را وارد کنید.")
            return
        }
        if (price < 0L) {
            showError("قیمت محصول معتبر نیست.")
            return
        }
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.createProduct(name, price, description, categoryId)
            val products = client.products()
            _state.value = _state.value.copy(
                loading = false,
                products = products,
                infoMessage = "محصول اضافه شد.",
            )
        }
    }

    /** ویرایش کامل محصول و همگام‌سازی دوباره با Backend. */
    fun updateProduct(
        product: Product,
        name: String,
        price: Long,
        description: String,
        categoryId: String?,
    ) {
        if (name.isBlank()) {
            showError("نام محصول نمی‌تواند خالی باشد.")
            return
        }
        if (price < 0L) {
            showError("قیمت محصول معتبر نیست.")
            return
        }
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.updateProduct(
                productId = product.id,
                name = name,
                price = price,
                description = description,
                categoryId = categoryId,
                isActive = product.isActive,
            )
            val products = client.products()
            _state.value = _state.value.copy(
                loading = false,
                products = products,
                infoMessage = "محصول ویرایش شد.",
            )
        }
    }

    /** فعال یا غیرفعال کردن محصول بدون حذف اطلاعات آن. */
    fun setProductActive(product: Product, active: Boolean) {
        runAuthenticated { client ->
            client.setProductActive(product.id, active)
            val products = client.products()
            _state.value = _state.value.copy(products = products)
        }
    }

    /** حذف محصول بعد از تأیید UI و Refresh نتیجه نهایی سرور. */
    fun deleteProduct(product: Product) {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.deleteProduct(product.id)
            val products = client.products()
            _state.value = _state.value.copy(
                loading = false,
                products = products,
                infoMessage = "محصول حذف شد.",
            )
        }
    }

    /** Refresh فهرست مشتریان؛ موجودی کیف‌پول فقط برای نمایش دریافت می‌شود. */
    fun refreshCustomers() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val customers = client.customers()
            _state.value = _state.value.copy(loading = false, customers = customers)
        }
    }

    /** Refresh سفارش‌ها. */
    fun refreshOrders() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val orders = client.orders()
            _state.value = _state.value.copy(loading = false, orders = orders)
        }
    }

    /** بازکردن یک سفارش؛ جزئیات فقط پس از پاسخ موفق سرور نمایش داده می‌شود. */
    fun openOrder(order: Order) {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true, errorMessage = null)
            val detail = client.orderDetail(order.id)
            _state.value = _state.value.copy(
                route = AppRoute.OrderDetail,
                loading = false,
                orderDetail = detail,
            )
        }
    }

    /** تازه‌سازی سفارش بازشده بدون تغییر Route. */
    fun refreshOrderDetail() {
        val current = _state.value.orderDetail ?: return
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val detail = client.orderDetail(current.id)
            _state.value = _state.value.copy(loading = false, orderDetail = detail)
        }
    }

    /** تغییر وضعیت در صفحه جزئیات و همگام‌سازی هم جزئیات و هم فهرست سفارش‌ها. */
    fun updateOrderDetailStatus(status: String) {
        val current = _state.value.orderDetail ?: return
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.updateOrderStatus(current.id, status)
            val detail = client.orderDetail(current.id)
            val orders = client.orders()
            _state.value = _state.value.copy(
                loading = false,
                orderDetail = detail,
                orders = orders,
                infoMessage = "وضعیت سفارش به‌روز شد.",
            )
        }
    }

    /** تغییر وضعیت سفارش و دریافت مجدد لیست برای همگام‌سازی. */
    fun updateOrderStatus(order: Order, status: String) {
        runAuthenticated { client ->
            client.updateOrderStatus(order.id, status)
            val orders = client.orders()
            _state.value = _state.value.copy(
                orders = orders,
                infoMessage = "وضعیت سفارش به‌روز شد.",
            )
        }
    }

    /** ذخیره تنظیمات Merchant؛ PIN و Secrets در این فرم عمداً وجود ندارند. */
    fun saveSettings(
        storeName: String,
        mandatoryChannel: String,
        reportChannel: String,
        supportLink: String,
        referralPercent: Double,
    ) {
        val merchant = _state.value.merchant ?: return
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val updated = client.updateSettings(
                merchant.copy(
                    storeName = storeName,
                    mandatoryChannel = mandatoryChannel,
                    reportChannel = reportChannel,
                    supportLink = supportLink,
                    referralPercent = referralPercent,
                )
            )
            _state.value = _state.value.copy(
                loading = false,
                merchant = updated,
                infoMessage = "تنظیمات ذخیره شد.",
            )
        }
    }

    /** ترجیح اعلان‌ها محلی ذخیره می‌شود تا Push در فاز بعد از همین تنظیم استفاده کند. */
    fun setNotificationsEnabled(enabled: Boolean) {
        preferences.notificationsEnabled = enabled
        _state.value = _state.value.copy(notificationsEnabled = enabled)
    }

    /** خروج امن: ابتدا Session سرور revoke می‌شود و سپس Credential محلی حذف می‌شود. */
    fun logout() {
        val token = preferences.readSessionToken()
        val baseUrl = preferences.baseUrl
        viewModelScope.launch {
            if (!token.isNullOrBlank() && baseUrl.isNotBlank()) {
                withContext(Dispatchers.IO) {
                    runCatching { ApiClient(baseUrl, token).logout() }
                }
            }
            preferences.clearSession()
            _state.value = AppUiState(
                route = AppRoute.Pair,
                loading = false,
                notificationsEnabled = preferences.notificationsEnabled,
                baseUrl = baseUrl,
                infoMessage = "اتصال اپ قطع شد.",
            )
        }
    }

    /** پیام‌های SnackBar بعد از نمایش توسط UI پاک می‌شوند. */
    fun consumeMessages() {
        _state.value = _state.value.copy(errorMessage = null, infoMessage = null)
    }

    /** تشخیص وجود نسخه جدید بدون اجبار به Update در منطق UI. */
    fun hasUpdate(): Boolean = (_state.value.versionInfo?.latestVersionCode ?: 0) > BuildConfig.VERSION_CODE

    /** بازیابی نشست رمز‌شده هنگام Launch. */
    private fun restoreSession() {
        val token = preferences.readSessionToken()
        val baseUrl = preferences.baseUrl

        if (token.isNullOrBlank() || baseUrl.isBlank()) {
            _state.value = _state.value.copy(route = AppRoute.Pair, loading = false)
            return
        }

        runNetwork {
            val client = ApiClient(baseUrl, token)
            val merchant = client.me()
            val dashboard = client.dashboard()
            val version = runCatching { ApiClient(baseUrl).version() }.getOrNull()
            _state.value = _state.value.copy(
                route = AppRoute.Dashboard,
                loading = false,
                merchant = merchant,
                dashboard = dashboard,
                versionInfo = version,
            )
        }
    }

    /** اجرای عملیات احراز هویت‌شده با ساخت Client از Session رمزگشایی‌شده. */
    private fun runAuthenticated(block: suspend (ApiClient) -> Unit) {
        val token = preferences.readSessionToken()
        val baseUrl = preferences.baseUrl
        if (token.isNullOrBlank() || baseUrl.isBlank()) {
            preferences.clearSession()
            _state.value = _state.value.copy(route = AppRoute.Pair, loading = false)
            return
        }

        runNetwork {
            block(ApiClient(baseUrl, token))
        }
    }

    /** Wrapper مشترک Coroutine برای جلوگیری از اجرای شبکه روی Main Thread. */
    private fun runNetwork(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { block() }
            } catch (error: Exception) {
                // اگر نشست منقضی/لغو شده باشد کاربر باید دوباره Pair کند.
                if ((error as? ir.asteam.telegramcc.data.ApiException)?.statusCode == 401) {
                    preferences.clearSession()
                    _state.value = _state.value.copy(
                        route = AppRoute.Pair,
                        loading = false,
                        merchant = null,
                        errorMessage = "نشست منقضی شده است؛ دوباره اپ را متصل کنید.",
                    )
                } else {
                    _state.value = _state.value.copy(
                        loading = false,
                        errorMessage = error.message ?: "خطای غیرمنتظره رخ داد.",
                    )
                }
            }
        }
    }

    /** ثبت خطای ورودی محلی بدون تماس شبکه. */
    private fun showError(message: String) {
        _state.value = _state.value.copy(errorMessage = message)
    }
}
