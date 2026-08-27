# =============================================================================
# apply-product-management.py
# اسکریپت موقت توسعه برای اتصال کامل ProductManagementScreen به لایه شبکه و
# ViewModel. منطق Patch در فایل مستقل نگه داشته می‌شود تا YAML فقط Runner باشد.
# =============================================================================

from pathlib import Path


# -----------------------------------------------------------------------------
# ApiClient: ایجاد/ویرایش/حذف محصول روی API موجود Backend.
# -----------------------------------------------------------------------------
api_path = Path("app/src/main/java/ir/asteam/telegramcc/data/ApiClient.kt")
api = api_path.read_text()

old_create = '''    /** ساخت محصول ساده؛ ویرایش جزئیات بیشتر در فاز بعد به همین API متصل می‌شود. */
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
'''

new_create = '''    /** ساخت محصول با دسته‌بندی اختیاری و برگرداندن رکورد ذخیره‌شده. */
    fun createProduct(
        name: String,
        price: Long,
        description: String,
        categoryId: String?,
    ): Product {
        val body = JSONObject()
            .put("name", name.trim())
            .put("price", price)
            .put("description", description.trim())

        // JSONObject.NULL باعث می‌شود Backend صریحاً محصول را بدون دسته‌بندی ذخیره کند.
        body.put("categoryId", categoryId ?: JSONObject.NULL)

        val root = request("POST", "/api/v1/products", body)
        return parseProduct(root.getJSONObject("product"))
    }

    /** ویرایش کامل مشخصات قابل مدیریت محصول. */
    fun updateProduct(
        productId: String,
        name: String,
        price: Long,
        description: String,
        categoryId: String?,
        isActive: Boolean,
    ): Product {
        val body = JSONObject()
            .put("name", name.trim())
            .put("price", price)
            .put("description", description.trim())
            .put("isActive", isActive)
            .put("categoryId", categoryId ?: JSONObject.NULL)

        val root = request("PATCH", "/api/v1/products/$productId", body)
        return parseProduct(root.getJSONObject("product"))
    }

    /** فعال/غیرفعال کردن سریع محصول بدون دست‌زدن به بقیه فیلدها. */
    fun setProductActive(productId: String, active: Boolean) {
        request(
            "PATCH",
            "/api/v1/products/$productId",
            JSONObject().put("isActive", active),
        )
    }

    /** حذف محصول؛ Backend merchant_id را دوباره کنترل می‌کند. */
    fun deleteProduct(productId: String) {
        request("DELETE", "/api/v1/products/$productId")
    }
'''

if old_create not in api:
    raise SystemExit("ApiClient product anchor not found")
api = api.replace(old_create, new_create, 1)

parser_anchor = '''    /** Merchant JSON را به مدل امن و قابل استفاده UI تبدیل می‌کند. */
    private fun parseMerchant(json: JSONObject): Merchant = Merchant(
'''

parser_insert = '''    /** Product JSON را به مدل یکتای اپ تبدیل می‌کند. */
    private fun parseProduct(item: JSONObject): Product = Product(
        id = item.getString("id"),
        categoryId = item.optNullableString("category_id"),
        name = item.optString("name_fa", item.optString("name_en", "محصول")),
        description = item.optString("description", ""),
        price = item.optLong("price", 0L),
        isActive = item.optBoolean("is_active", true),
        createdAt = item.optString("created_at", ""),
    )

    /** Merchant JSON را به مدل امن و قابل استفاده UI تبدیل می‌کند. */
    private fun parseMerchant(json: JSONObject): Merchant = Merchant(
'''

if parser_anchor not in api:
    raise SystemExit("ApiClient parser anchor not found")
api = api.replace(parser_anchor, parser_insert, 1)
api_path.write_text(api)


# -----------------------------------------------------------------------------
# ViewModel: دسته‌بندی و محصولات را همگام و CRUD کامل محصول را اضافه می‌کنیم.
# -----------------------------------------------------------------------------
vm_path = Path("app/src/main/java/ir/asteam/telegramcc/ui/AppViewModel.kt")
vm = vm_path.read_text()

old_refresh = '''    /** Refresh لیست محصولات. */
    fun refreshProducts() {
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            val products = client.products()
            _state.value = _state.value.copy(loading = false, products = products)
        }
    }

    /** ساخت یک محصول پایه و Refresh لیست. */
    fun createProduct(name: String, price: Long, description: String) {
        if (name.isBlank()) {
            showError("نام محصول را وارد کنید.")
            return
        }
        runAuthenticated { client ->
            _state.value = _state.value.copy(loading = true)
            client.createProduct(name, price, description)
            val products = client.products()
            _state.value = _state.value.copy(
                loading = false,
                products = products,
                infoMessage = "محصول اضافه شد.",
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
'''

new_refresh = '''    /** Refresh هم‌زمان محصولات و دسته‌بندی‌ها برای نمایش فرم مدیریت کامل. */
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
'''

if old_refresh not in vm:
    raise SystemExit("ViewModel product anchor not found")
vm = vm.replace(old_refresh, new_refresh, 1)
vm_path.write_text(vm)


# -----------------------------------------------------------------------------
# Root UI: مسیر Products را به صفحه جدید وصل می‌کنیم.
# -----------------------------------------------------------------------------
ui_path = Path("app/src/main/java/ir/asteam/telegramcc/ui/TelegramCcApp.kt")
ui = ui_path.read_text()
old_route = '                    AppRoute.Products -> ProductsScreen(state, viewModel)\n'
new_route = '                    AppRoute.Products -> ProductManagementScreen(state, viewModel)\n'

if old_route not in ui:
    raise SystemExit("TelegramCcApp product route anchor not found")
ui = ui.replace(old_route, new_route, 1)
ui_path.write_text(ui)
