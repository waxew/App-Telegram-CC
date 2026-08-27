// =============================================================================
// ui/AppViewModel.kt
// State و عملیات اصلی اپ: اتصال مستقیم BotFather Token، نشست امن، داشبورد،
// دسته‌بندی‌ها، محصولات، مشتری‌ها، سفارش‌ها و تنظیمات.
// =============================================================================
package ir.asteam.telegramcc.ui

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ir.asteam.telegramcc.BuildConfig
import ir.asteam.telegramcc.data.ApiClient
import ir.asteam.telegramcc.data.BotConnectClient
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
            baseUrl = preferences.baseUrl.ifBlank { BuildConfig.BACKEND_BASE_URL },
        )
    )

    // UI فقط نسخه Read-only StateFlow را می‌بیند.
    val state: StateFlow<AppUiState> = _state.asStateFlow()

    init {
        // در شروع اپ، اگر نشست قبلی وجود دارد اعتبار آن بررسی می‌شود.
        restoreSession()
    }

    /**
     * فلو اصلی نسخه نهایی: کاربر فقط BotFather Token خودش را وارد می‌کند.
     * آدرس Backend ثابت داخل BuildConfig است و Token پس از صدور Session ذخیره نمی‌شود.
     */
    fun connectBot(botToken: String) {
        val token = botToken.trim()
        if (!/^\d+:[A-Za-z0-9_-]{30,}$/.toRegex().matches(token)) {
            showError("توکن ربات معتبر نیست. آن را مستقیماً از BotFather کپی کنید.")
            return
        }

        runNetwork {
            _state.value = _state.value.copy(loading = true, errorMessage = null, infoMessage = null)
            val baseUrl = BuildConfig.BACKEND_BASE_URL.trim().trimEnd('/')
            val result = BotConnectClient(baseUrl).connect(
                botToken = token,
                deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
            )

            // فقط URL عمومی Backend و Session رمز‌شده ذخیره می‌شوند؛ Bot Token ذخیره نمی‌شود.
            preferences.baseUrl = baseUrl
            preferences.saveSessionToken(result.sessionToken)

            val authenticatedClient = ApiClient(baseUrl, result.sessionToken)
            val dashboard = authenticatedClient.dashboard()
            val version = runCatching { ApiClient(baseUrl).version() }.getOrNull()

            _state.value = _state.value.copy(
                route = AppRoute.Dashboard,
                loading = false,
                merchant = result.merchant,
                dashboard = dashboard,
                baseUrl = baseUrl,
                versionInfo = version,
                infoMessage = "ربات با موفقیت متصل شد.",
            )
        }
    }

    /**
     * Pairing قدیمی فقط برای سازگاری سورس قبلی نگه داشته شده است.
     * UI جدید دیگر این متد را به کاربر نمایش نمی‌دهد.
     */
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
            preferences.baseUrl = normalized
            preferences.saveSessionToken(result.sessionToken)
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

    /** رفتار Back: جزئیات سفارش به سفارش‌ها و سایر صفحات فرعی به داشبورد برمی‌گردند. */
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

    /** Refresh فهرست دسته‌بندی‌ها. */
    fun refreshCategories() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val categories = client.categories()
            _state.value = _state.value.copy(loading = false, categories = categories)
        }
    }

    /** ساخت دسته‌بندی و همگام‌سازی لیست. */
    fun createCategory(name: String) {
        if (name.isBlank()) {
            showError("نام دسته‌بندی را وارد کنید.")
            return
        }
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.createCategory(name)
            val categories = client.categories()
            _state.value = _state.value.copy(loading = false, categories = categories, infoMessage = "دسته‌بندی اضافه شد.")
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
            client.updateCategory(category.id, name, category.isActive, sortOrder)
            val categories = client.categories()
            _state.value = _state.value.copy(loading = false, categories = categories, infoMessage = "دسته‌بندی ویرایش شد.")
        }
    }

    /** فعال/غیرفعال کردن دسته‌بندی بدون حذف محصولات آن. */
    fun setCategoryActive(category: Category, active: Boolean) {
        runAuthenticated { client ->
            client.updateCategory(category.id, category.name, active, category.sortOrder)
            _state.value = _state.value.copy(categories = client.categories())
        }
    }

    /** حذف دسته‌بندی و دریافت دوباره لیست. */
    fun deleteCategory(category: Category) {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.deleteCategory(category.id)
            _state.value = _state.value.copy(loading = false, categories = client.categories(), infoMessage = "دسته‌بندی حذف شد.")
        }
    }

    /** Refresh محصولات و دسته‌بندی‌ها. */
    fun refreshProducts() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val categories = client.categories()
            val products = client.products()
            _state.value = _state.value.copy(loading = false, categories = categories, products = products)
        }
    }

    /** ساخت محصول. */
    fun createProduct(name: String, price: Long, description: String, categoryId: String?) {
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
            _state.value = _state.value.copy(loading = false, products = client.products(), infoMessage = "محصول اضافه شد.")
        }
    }

    /** ویرایش کامل محصول. */
    fun updateProduct(product: Product, name: String, price: Long, description: String, categoryId: String?) {
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
            client.updateProduct(product.id, name, price, description, categoryId, product.isActive)
            _state.value = _state.value.copy(loading = false, products = client.products(), infoMessage = "محصول ویرایش شد.")
        }
    }

    /** فعال یا غیرفعال کردن محصول. */
    fun setProductActive(product: Product, active: Boolean) {
        runAuthenticated { client ->
            client.setProductActive(product.id, active)
            _state.value = _state.value.copy(products = client.products())
        }
    }

    /** حذف محصول. */
    fun deleteProduct(product: Product) {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.deleteProduct(product.id)
            _state.value = _state.value.copy(loading = false, products = client.products(), infoMessage = "محصول حذف شد.")
        }
    }

    /** Refresh مشتریان؛ کیف‌پول فقط Read-only است. */
    fun refreshCustomers() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            _state.value = _state.value.copy(loading = false, customers = client.customers())
        }
    }

    /** Refresh سفارش‌ها. */
    fun refreshOrders() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            _state.value = _state.value.copy(loading = false, orders = client.orders())
        }
    }

    /** بازکردن جزئیات سفارش. */
    fun openOrder(order: Order) {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true, errorMessage = null)
            val detail = client.orderDetail(order.id)
            _state.value = _state.value.copy(route = AppRoute.OrderDetail, loading = false, orderDetail = detail)
        }
    }

    /** تازه‌سازی سفارش بازشده. */
    fun refreshOrderDetail() {
        val current = _state.value.orderDetail ?: return
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            _state.value = _state.value.copy(loading = false, orderDetail = client.orderDetail(current.id))
        }
    }

    /** تغییر وضعیت در صفحه جزئیات. */
    fun updateOrderDetailStatus(status: String) {
        val current = _state.value.orderDetail ?: return
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.updateOrderStatus(current.id, status)
            val detail = client.orderDetail(current.id)
            val orders = client.orders()
            _state.value = _state.value.copy(loading = false, orderDetail = detail, orders = orders, infoMessage = "وضعیت سفارش به‌روز شد.")
        }
    }

    /** تغییر وضعیت سفارش از فهرست. */
    fun updateOrderStatus(order: Order, status: String) {
        runAuthenticated { client ->
            client.updateOrderStatus(order.id, status)
            _state.value = _state.value.copy(orders = client.orders(), infoMessage = "وضعیت سفارش به‌روز شد.")
        }
    }

    /** ذخیره تنظیمات Merchant؛ Secretها در این فرم وجود ندارند. */
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
            _state.value = _state.value.copy(loading = false, merchant = updated, infoMessage = "تنظیمات ذخیره شد.")
        }
    }

    /** ترجیح اعلان‌ها محلی ذخیره می‌شود. */
    fun setNotificationsEnabled(enabled: Boolean) {
        preferences.notificationsEnabled = enabled
        _state.value = _state.value.copy(notificationsEnabled = enabled)
    }

    /** خروج امن: Session سرور revoke و Credential محلی حذف می‌شود. */
    fun logout() {
        val token = preferences.readSessionToken()
        val baseUrl = preferences.baseUrl.ifBlank { BuildConfig.BACKEND_BASE_URL }
        viewModelScope.launch {
            if (!token.isNullOrBlank() && baseUrl.isNotBlank()) {
                withContext(Dispatchers.IO) { runCatching { ApiClient(baseUrl, token).logout() } }
            }
            preferences.clearSession()
            _state.value = AppUiState(
                route = AppRoute.Pair,
                loading = false,
                notificationsEnabled = preferences.notificationsEnabled,
                baseUrl = BuildConfig.BACKEND_BASE_URL,
                infoMessage = "اتصال ربات قطع شد.",
            )
        }
    }

    /** پیام‌های SnackBar بعد از نمایش پاک می‌شوند. */
    fun consumeMessages() {
        _state.value = _state.value.copy(errorMessage = null, infoMessage = null)
    }

    /** تشخیص وجود نسخه جدید. */
    fun hasUpdate(): Boolean = (_state.value.versionInfo?.latestVersionCode ?: 0) > BuildConfig.VERSION_CODE

    /** بازیابی نشست رمز‌شده هنگام Launch. */
    private fun restoreSession() {
        val token = preferences.readSessionToken()
        val baseUrl = preferences.baseUrl.ifBlank { BuildConfig.BACKEND_BASE_URL }
        if (token.isNullOrBlank()) {
            _state.value = _state.value.copy(route = AppRoute.Pair, loading = false, baseUrl = baseUrl)
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
                baseUrl = baseUrl,
                versionInfo = version,
            )
        }
    }

    /** اجرای عملیات احراز هویت‌شده با Session رمزگشایی‌شده. */
    private fun runAuthenticated(block: suspend (ApiClient) -> Unit) {
        val token = preferences.readSessionToken()
        val baseUrl = preferences.baseUrl.ifBlank { BuildConfig.BACKEND_BASE_URL }
        if (token.isNullOrBlank()) {
            preferences.clearSession()
            _state.value = _state.value.copy(route = AppRoute.Pair, loading = false)
            return
        }
        runNetwork { block(ApiClient(baseUrl, token)) }
    }

    /** Wrapper مشترک Coroutine برای جلوگیری از اجرای شبکه روی Main Thread. */
    private fun runNetwork(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { block() }
            } catch (error: Exception) {
                if ((error as? ir.asteam.telegramcc.data.ApiException)?.statusCode == 401) {
                    preferences.clearSession()
                    _state.value = _state.value.copy(
                        route = AppRoute.Pair,
                        loading = false,
                        merchant = null,
                        errorMessage = error.message ?: "نشست منقضی شده است؛ دوباره ربات را متصل کنید.",
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
