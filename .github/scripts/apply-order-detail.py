# =============================================================================
# apply-order-detail.py
# اسکریپت موقت توسعه برای اتصال جزئیات سفارش بین Backend و اپ Android.
#
# پس از اجرای موفق و تأیید CI حذف می‌شود. سورس واقعی قابلیت در فایل‌های اصلی
# پروژه باقی می‌ماند؛ این فایل فقط Patch هماهنگ چند فایل بزرگ را انجام می‌دهد.
# =============================================================================

from pathlib import Path


# =============================================================================
# 1) Backend API — Route امن جزئیات سفارش
# =============================================================================
backend_path = Path("backend/src/api/appApi.js")
backend = backend_path.read_text()

backend_anchor = '''  const orderStatusMatch = path.match(/^\\/api\\/v1\\/orders\\/([a-f0-9-]+)\\/status$/i);
'''

backend_insert = '''  // جزئیات یک سفارش؛ ابتدا مالکیت Merchant روی خود سفارش اثبات می‌شود و فقط
  // بعد از آن اقلام همان سفارش خوانده می‌شوند. این دو Query صریح، ریسک IDOR را
  // کمتر می‌کنند و وابسته به نام‌گذاری خودکار Relation در PostgREST نیستند.
  const orderDetailMatch = path.match(/^\\/api\\/v1\\/orders\\/([a-f0-9-]+)$/i);
  if (orderDetailMatch && request.method === "GET") {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, status, subtotal_amount, discount_amount, total_amount, phone, address, delivery_method, created_at, customer:customers(first_name, username)"
      )
      .eq("id", orderDetailMatch[1])
      .eq("merchant_id", merchant.id)
      .maybeSingle();

    if (orderError) {
      console.error("خطا در خواندن جزئیات سفارش:", orderError.message);
      return apiError("DATABASE_ERROR", "خواندن جزئیات سفارش ناموفق بود.", 500);
    }
    if (!order) return apiError("NOT_FOUND", "سفارش پیدا نشد.", 404);

    // چون order.id فقط بعد از کنترل merchant_id به این مرحله می‌رسد، اقلامی که
    // با این order_id خوانده می‌شوند متعلق به همین فروشگاه هستند.
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("id, product_id, product_name, unit_price, quantity")
      .eq("order_id", order.id);

    if (itemsError) {
      console.error("خطا در خواندن اقلام سفارش:", itemsError.message);
      return apiError("DATABASE_ERROR", "خواندن اقلام سفارش ناموفق بود.", 500);
    }

    return json({
      ok: true,
      order: {
        id: order.id,
        status: order.status,
        subtotalAmount: Number(order.subtotal_amount || 0),
        discountAmount: Number(order.discount_amount || 0),
        totalAmount: Number(order.total_amount || 0),
        phone: order.phone || "",
        address: order.address || "",
        deliveryMethod: order.delivery_method || "",
        createdAt: order.created_at,
        customerName: order.customer?.first_name || "",
        customerUsername: order.customer?.username || "",
        items: (items || []).map((item) => ({
          id: item.id,
          productId: item.product_id || null,
          productName: item.product_name,
          unitPrice: Number(item.unit_price || 0),
          quantity: Number(item.quantity || 0),
        })),
      },
    });
  }

  const orderStatusMatch = path.match(/^\\/api\\/v1\\/orders\\/([a-f0-9-]+)\\/status$/i);
'''

if backend_anchor not in backend:
    raise SystemExit("Backend order status anchor not found")
backend = backend.replace(backend_anchor, backend_insert, 1)
backend_path.write_text(backend)


# =============================================================================
# 2) Android ApiClient — دریافت OrderDetail
# =============================================================================
api_path = Path("app/src/main/java/ir/asteam/telegramcc/data/ApiClient.kt")
api = api_path.read_text()

api_anchor = '''    /** تغییر وضعیت سفارش با لیست وضعیت‌های کنترل‌شده در Backend. */
    fun updateOrderStatus(orderId: String, status: String) {
'''

api_insert = '''    /** دریافت جزئیات کامل یک سفارش متعلق به Merchant فعلی. */
    fun orderDetail(orderId: String): OrderDetail {
        val root = request("GET", "/api/v1/orders/$orderId")
        val json = root.getJSONObject("order")
        val itemsJson = json.optJSONArray("items") ?: JSONArray()

        val items = buildList {
            for (index in 0 until itemsJson.length()) {
                val item = itemsJson.getJSONObject(index)
                add(
                    OrderItem(
                        id = item.getString("id"),
                        productId = item.optNullableString("productId"),
                        productName = item.optString("productName", "محصول"),
                        unitPrice = item.optLong("unitPrice", 0L),
                        quantity = item.optInt("quantity", 0),
                    )
                )
            }
        }

        return OrderDetail(
            id = json.getString("id"),
            status = json.optString("status", "pending"),
            subtotalAmount = json.optLong("subtotalAmount", 0L),
            discountAmount = json.optLong("discountAmount", 0L),
            totalAmount = json.optLong("totalAmount", 0L),
            phone = json.optString("phone", ""),
            address = json.optString("address", ""),
            deliveryMethod = json.optString("deliveryMethod", ""),
            createdAt = json.optString("createdAt", ""),
            customerName = json.optString("customerName", ""),
            customerUsername = json.optString("customerUsername", ""),
            items = items,
        )
    }

    /** تغییر وضعیت سفارش با لیست وضعیت‌های کنترل‌شده در Backend. */
    fun updateOrderStatus(orderId: String, status: String) {
'''

if api_anchor not in api:
    raise SystemExit("ApiClient order status anchor not found")
api = api.replace(api_anchor, api_insert, 1)
api_path.write_text(api)


# =============================================================================
# 3) Android ViewModel — Route، State و عملیات جزئیات سفارش
# =============================================================================
vm_path = Path("app/src/main/java/ir/asteam/telegramcc/ui/AppViewModel.kt")
vm = vm_path.read_text()

# Import مدل جدید.
import_anchor = '''import ir.asteam.telegramcc.data.Order
import ir.asteam.telegramcc.data.Product
'''
import_insert = '''import ir.asteam.telegramcc.data.Order
import ir.asteam.telegramcc.data.OrderDetail
import ir.asteam.telegramcc.data.Product
'''
if import_anchor not in vm:
    raise SystemExit("ViewModel import anchor not found")
vm = vm.replace(import_anchor, import_insert, 1)

# Route جزئیات.
route_anchor = '''    Products,
    Orders,
    Settings,
'''
route_insert = '''    Products,
    Orders,
    OrderDetail,
    Settings,
'''
if route_anchor not in vm:
    raise SystemExit("ViewModel route anchor not found")
vm = vm.replace(route_anchor, route_insert, 1)

# State جزئیات.
state_anchor = '''    val products: List<Product> = emptyList(),
    val orders: List<Order> = emptyList(),
    val errorMessage: String? = null,
'''
state_insert = '''    val products: List<Product> = emptyList(),
    val orders: List<Order> = emptyList(),
    val orderDetail: OrderDetail? = null,
    val errorMessage: String? = null,
'''
if state_anchor not in vm:
    raise SystemExit("ViewModel state anchor not found")
vm = vm.replace(state_anchor, state_insert, 1)

# Back از جزئیات به فهرست سفارش‌ها؛ سایر صفحات فرعی همچنان به داشبورد.
back_anchor = '''    /** دکمه Back در صفحات فرعی همیشه به داشبورد برمی‌گردد، نه خروج ناگهانی از اپ. */
    fun navigateBack(): Boolean {
        val current = _state.value.route
        return if (current != AppRoute.Dashboard && current != AppRoute.Pair) {
            _state.value = _state.value.copy(route = AppRoute.Dashboard)
            true
        } else {
            false
        }
    }
'''
back_insert = '''    /**
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
'''
if back_anchor not in vm:
    raise SystemExit("ViewModel back anchor not found")
vm = vm.replace(back_anchor, back_insert, 1)

# عملیات جزئیات قبل از updateOrderStatus قدیمی اضافه می‌شود تا کد قدیمی هم سازگار بماند.
order_anchor = '''    /** تغییر وضعیت سفارش و دریافت مجدد لیست برای همگام‌سازی. */
    fun updateOrderStatus(order: Order, status: String) {
'''
order_insert = '''    /** بازکردن یک سفارش؛ جزئیات فقط پس از پاسخ موفق سرور نمایش داده می‌شود. */
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
'''
if order_anchor not in vm:
    raise SystemExit("ViewModel order anchor not found")
vm = vm.replace(order_anchor, order_insert, 1)
vm_path.write_text(vm)


# =============================================================================
# 4) Root Compose UI — Route صفحات جدید و عنوان AppBar
# =============================================================================
ui_path = Path("app/src/main/java/ir/asteam/telegramcc/ui/TelegramCcApp.kt")
ui = ui_path.read_text()

ui_route_anchor = '''                    AppRoute.Products -> ProductManagementScreen(state, viewModel)
                    AppRoute.Orders -> OrdersScreen(state, viewModel)
                    AppRoute.Settings -> SettingsScreen(state, viewModel)
'''
ui_route_insert = '''                    AppRoute.Products -> ProductManagementScreen(state, viewModel)
                    AppRoute.Orders -> OrderManagementScreen(state, viewModel)
                    AppRoute.OrderDetail -> OrderDetailScreen(state, viewModel)
                    AppRoute.Settings -> SettingsScreen(state, viewModel)
'''
if ui_route_anchor not in ui:
    raise SystemExit("TelegramCcApp order route anchor not found")
ui = ui.replace(ui_route_anchor, ui_route_insert, 1)

ui_title_anchor = '''    AppRoute.Products -> "محصولات"
    AppRoute.Orders -> "سفارش‌ها"
    AppRoute.Settings -> "تنظیمات"
'''
ui_title_insert = '''    AppRoute.Products -> "محصولات"
    AppRoute.Orders -> "سفارش‌ها"
    AppRoute.OrderDetail -> "جزئیات سفارش"
    AppRoute.Settings -> "تنظیمات"
'''
if ui_title_anchor not in ui:
    raise SystemExit("TelegramCcApp title anchor not found")
ui = ui.replace(ui_title_anchor, ui_title_insert, 1)
ui_path.write_text(ui)
