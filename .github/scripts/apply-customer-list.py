# =============================================================================
# apply-customer-list.py
# Patch موقت برای اتصال فهرست مشتریان Backend به اپ Android.
# پس از تأیید CI حذف می‌شود.
# =============================================================================

from pathlib import Path


# =============================================================================
# Backend API — فهرست مشتریان همان Merchant
# =============================================================================
backend_path = Path("backend/src/api/appApi.js")
backend = backend_path.read_text()

backend_anchor = '''  if (path === "/api/v1/orders" && request.method === "GET") {
'''
backend_insert = '''  // فهرست مشتریان فروشگاه؛ هیچ موجودی/اطلاعاتی از Merchant دیگر بازگردانده نمی‌شود.
  // این Route فعلاً فقط خواندنی است تا تغییر کیف‌پول بدون Ledger رخ ندهد.
  if (path === "/api/v1/customers" && request.method === "GET") {
    const { data, error } = await supabase
      .from("customers")
      .select("id, telegram_id, first_name, username, phone, address, wallet_balance, created_at")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("خطا در خواندن مشتریان:", error.message);
      return apiError("DATABASE_ERROR", "خواندن مشتریان ناموفق بود.", 500);
    }

    return json({
      ok: true,
      customers: (data || []).map((customer) => ({
        id: customer.id,
        telegramId: Number(customer.telegram_id || 0),
        firstName: customer.first_name || "",
        username: customer.username || "",
        phone: customer.phone || "",
        address: customer.address || "",
        walletBalance: Number(customer.wallet_balance || 0),
        createdAt: customer.created_at,
      })),
    });
  }

  if (path === "/api/v1/orders" && request.method === "GET") {
'''
if backend_anchor not in backend:
    raise SystemExit("Backend customers insertion anchor not found")
backend = backend.replace(backend_anchor, backend_insert, 1)
backend_path.write_text(backend)


# =============================================================================
# Android ApiClient — parser فهرست مشتریان
# =============================================================================
api_path = Path("app/src/main/java/ir/asteam/telegramcc/data/ApiClient.kt")
api = api_path.read_text()

api_anchor = '''    /** دریافت سفارش‌ها. */
    fun orders(): List<Order> {
'''
api_insert = '''    /** دریافت مشتریان Merchant فعلی؛ این API فقط Read-only است. */
    fun customers(): List<Customer> {
        val array = request("GET", "/api/v1/customers").optJSONArray("customers") ?: JSONArray()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                add(
                    Customer(
                        id = item.getString("id"),
                        telegramId = item.optLong("telegramId", 0L),
                        firstName = item.optString("firstName", ""),
                        username = item.optString("username", ""),
                        phone = item.optString("phone", ""),
                        address = item.optString("address", ""),
                        walletBalance = item.optLong("walletBalance", 0L),
                        createdAt = item.optString("createdAt", ""),
                    )
                )
            }
        }
    }

    /** دریافت سفارش‌ها. */
    fun orders(): List<Order> {
'''
if api_anchor not in api:
    raise SystemExit("ApiClient orders anchor not found")
api = api.replace(api_anchor, api_insert, 1)
api_path.write_text(api)


# =============================================================================
# Android ViewModel — Route/State/Refresh مشتریان
# =============================================================================
vm_path = Path("app/src/main/java/ir/asteam/telegramcc/ui/AppViewModel.kt")
vm = vm_path.read_text()

import_anchor = '''import ir.asteam.telegramcc.data.Category
import ir.asteam.telegramcc.data.Dashboard
'''
import_insert = '''import ir.asteam.telegramcc.data.Category
import ir.asteam.telegramcc.data.Customer
import ir.asteam.telegramcc.data.Dashboard
'''
if import_anchor not in vm:
    raise SystemExit("ViewModel customer import anchor not found")
vm = vm.replace(import_anchor, import_insert, 1)

route_anchor = '''    Categories,
    Products,
    Orders,
'''
route_insert = '''    Categories,
    Products,
    Customers,
    Orders,
'''
if route_anchor not in vm:
    raise SystemExit("ViewModel customer route anchor not found")
vm = vm.replace(route_anchor, route_insert, 1)

state_anchor = '''    val categories: List<Category> = emptyList(),
    val products: List<Product> = emptyList(),
    val orders: List<Order> = emptyList(),
'''
state_insert = '''    val categories: List<Category> = emptyList(),
    val products: List<Product> = emptyList(),
    val customers: List<Customer> = emptyList(),
    val orders: List<Order> = emptyList(),
'''
if state_anchor not in vm:
    raise SystemExit("ViewModel customer state anchor not found")
vm = vm.replace(state_anchor, state_insert, 1)

navigate_anchor = '''            AppRoute.Categories -> refreshCategories()
            AppRoute.Products -> refreshProducts()
            AppRoute.Orders -> refreshOrders()
'''
navigate_insert = '''            AppRoute.Categories -> refreshCategories()
            AppRoute.Products -> refreshProducts()
            AppRoute.Customers -> refreshCustomers()
            AppRoute.Orders -> refreshOrders()
'''
if navigate_anchor not in vm:
    raise SystemExit("ViewModel customer navigation anchor not found")
vm = vm.replace(navigate_anchor, navigate_insert, 1)

method_anchor = '''    /** Refresh سفارش‌ها. */
    fun refreshOrders() {
'''
method_insert = '''    /** Refresh فهرست مشتریان؛ موجودی کیف‌پول فقط برای نمایش دریافت می‌شود. */
    fun refreshCustomers() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val customers = client.customers()
            _state.value = _state.value.copy(loading = false, customers = customers)
        }
    }

    /** Refresh سفارش‌ها. */
    fun refreshOrders() {
'''
if method_anchor not in vm:
    raise SystemExit("ViewModel customer method anchor not found")
vm = vm.replace(method_anchor, method_insert, 1)
vm_path.write_text(vm)


# =============================================================================
# Root UI — Route، Drawer و عنوان
# =============================================================================
ui_path = Path("app/src/main/java/ir/asteam/telegramcc/ui/TelegramCcApp.kt")
ui = ui_path.read_text()

ui_route_anchor = '''                    AppRoute.Products -> ProductManagementScreen(state, viewModel)
                    AppRoute.Orders -> OrderManagementScreen(state, viewModel)
'''
ui_route_insert = '''                    AppRoute.Products -> ProductManagementScreen(state, viewModel)
                    AppRoute.Customers -> CustomerManagementScreen(state, viewModel)
                    AppRoute.Orders -> OrderManagementScreen(state, viewModel)
'''
if ui_route_anchor not in ui:
    raise SystemExit("TelegramCcApp customer route anchor not found")
ui = ui.replace(ui_route_anchor, ui_route_insert, 1)

# گزینه مشتری‌ها را بین محصولات و سفارش‌ها قرار می‌دهیم.
drawer_anchor = '''        DrawerRouteItem("محصولات", Icons.Default.ShoppingBag, AppRoute.Products, selectedRoute, onNavigate)
        DrawerRouteItem("سفارش‌ها", Icons.Default.ReceiptLong, AppRoute.Orders, selectedRoute, onNavigate)
'''
drawer_insert = '''        DrawerRouteItem("محصولات", Icons.Default.ShoppingBag, AppRoute.Products, selectedRoute, onNavigate)
        DrawerRouteItem("مشتری‌ها", Icons.Default.Person, AppRoute.Customers, selectedRoute, onNavigate)
        DrawerRouteItem("سفارش‌ها", Icons.Default.ReceiptLong, AppRoute.Orders, selectedRoute, onNavigate)
'''
if drawer_anchor not in ui:
    raise SystemExit("TelegramCcApp customer drawer anchor not found")
ui = ui.replace(drawer_anchor, drawer_insert, 1)

title_anchor = '''    AppRoute.Products -> "محصولات"
    AppRoute.Orders -> "سفارش‌ها"
'''
title_insert = '''    AppRoute.Products -> "محصولات"
    AppRoute.Customers -> "مشتری‌ها"
    AppRoute.Orders -> "سفارش‌ها"
'''
if title_anchor not in ui:
    raise SystemExit("TelegramCcApp customer title anchor not found")
ui = ui.replace(title_anchor, title_insert, 1)
ui_path.write_text(ui)
