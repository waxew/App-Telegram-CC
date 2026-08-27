// =============================================================================
// ui/TelegramCcApp.kt
// رابط کاربری کامل نسخهٔ پایه: Pairing، Drawer راست، داشبورد، محصولات، سفارش‌ها
// تنظیمات، درباره ما، تماس با ما و درباره نرم‌افزار.
// =============================================================================
package ir.asteam.telegramcc.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.asteam.telegramcc.BuildConfig
import ir.asteam.telegramcc.data.Merchant
import ir.asteam.telegramcc.data.Order
import ir.asteam.telegramcc.data.Product
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

/** Root کل UI؛ LayoutDirection=Rtl باعث باز شدن Drawer از سمت راست می‌شود. */
@Composable
fun TelegramCcApp(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val darkTheme = androidx.compose.foundation.isSystemInDarkTheme()

    MaterialTheme(colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme()) {
        // تمام صفحات فارسی و Drawer در جهت راست‌به‌چپ رندر می‌شوند.
        androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            Surface(modifier = Modifier.fillMaxSize()) {
                if (state.route == AppRoute.Pair) {
                    PairScreen(
                        state = state,
                        onPair = viewModel::pair,
                    )
                } else {
                    AuthenticatedShell(
                        state = state,
                        viewModel = viewModel,
                    )
                }
            }
        }
    }
}

/** صفحه اتصال اولیه؛ Secretهای واقعی سرور در این صفحه درخواست نمی‌شوند. */
@Composable
private fun PairScreen(
    state: AppUiState,
    onPair: (String, String) -> Unit,
) {
    var baseUrl by rememberSaveable(state.baseUrl) { mutableStateOf(state.baseUrl) }
    var code by rememberSaveable { mutableStateOf("") }
    val snackbarHostState = remember { SnackbarHostState() }

    // خطا/پیام Pairing در پایین صفحه نمایش داده می‌شود.
    LaunchedEffect(state.errorMessage, state.infoMessage) {
        state.errorMessage?.let { snackbarHostState.showSnackbar(it) }
        state.infoMessage?.let { snackbarHostState.showSnackbar(it) }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Storefront,
                    contentDescription = null,
                )
                Text(
                    text = "تلگرام CC",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "برای مدیریت فروشگاه، داخل ربات فروشگاهی گزینه «اتصال اپ مدیریت» را بزنید و کد یک‌بارمصرف را اینجا وارد کنید.",
                    style = MaterialTheme.typography.bodyMedium,
                )

                OutlinedTextField(
                    value = baseUrl,
                    onValueChange = { baseUrl = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("آدرس HTTPS سرور Worker") },
                    placeholder = { Text("https://example.workers.dev") },
                    singleLine = true,
                )

                OutlinedTextField(
                    value = code,
                    onValueChange = {
                        // فقط ۸ کاراکتر اول نگه داشته می‌شود تا خطای تایپی کمتر شود.
                        code = it.uppercase().filter { char -> char.isLetterOrDigit() }.take(8)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("کد اتصال ۸ کاراکتری") },
                    singleLine = true,
                )

                Button(
                    onClick = { onPair(baseUrl, code) },
                    enabled = !state.loading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.loading) {
                        CircularProgressIndicator(modifier = Modifier.width(22.dp))
                    } else {
                        Text("اتصال به فروشگاه")
                    }
                }

                Text(
                    text = "توکن BotFather و کلید service_role هرگز داخل اپ وارد یا ذخیره نمی‌شوند.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

/** Shell مشترک تمام صفحات بعد از ورود: Drawer راست، AppBar و Back Navigation. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuthenticatedShell(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    val context = LocalContext.current
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    // پیام‌های موفق/خطا به‌صورت SnackBar نمایش داده و سپس مصرف می‌شوند.
    LaunchedEffect(state.errorMessage, state.infoMessage) {
        val message = state.errorMessage ?: state.infoMessage
        if (!message.isNullOrBlank()) {
            snackbarHostState.showSnackbar(message)
            viewModel.consumeMessages()
        }
    }

    // رفتار Back: ابتدا Drawer را می‌بندیم؛ سپس از صفحه فرعی به داشبورد می‌رویم.
    BackHandler(enabled = drawerState.isOpen || state.route != AppRoute.Dashboard) {
        if (drawerState.isOpen) {
            scope.launch { drawerState.close() }
        } else {
            viewModel.navigateBack()
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            AppDrawer(
                merchant = state.merchant,
                selectedRoute = state.route,
                onNavigate = { route ->
                    viewModel.navigate(route)
                    scope.launch { drawerState.close() }
                },
                onShare = {
                    // تا زمان انتشار در مارکت، لینک Repository برای اشتراک استفاده می‌شود.
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(
                            Intent.EXTRA_TEXT,
                            "تلگرام CC - پنل مدیریت فروشگاه تلگرامی\nhttps://github.com/waxew/App-Telegram-CC",
                        )
                    }
                    context.startActivity(Intent.createChooser(intent, "معرفی به دوستان"))
                    scope.launch { drawerState.close() }
                },
                onLogout = {
                    scope.launch { drawerState.close() }
                    viewModel.logout()
                },
            )
        },
    ) {
        Scaffold(
            snackbarHost = { SnackbarHost(snackbarHostState) },
            topBar = {
                CenterAlignedTopAppBar(
                    title = { Text(routeTitle(state.route)) },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "باز کردن منو")
                        }
                    },
                    actions = {
                        // صفحات فرعی علاوه بر Back سیستمی، دکمهٔ واضح بازگشت هم دارند.
                        if (state.route != AppRoute.Dashboard) {
                            IconButton(onClick = { viewModel.navigateBack() }) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
                            }
                        }
                    },
                )
            },
        ) { padding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                when (state.route) {
                    AppRoute.Dashboard -> DashboardScreen(state, viewModel)
                    AppRoute.Products -> ProductsScreen(state, viewModel)
                    AppRoute.Orders -> OrdersScreen(state, viewModel)
                    AppRoute.Settings -> SettingsScreen(state, viewModel)
                    AppRoute.AboutUs -> AboutUsScreen()
                    AppRoute.ContactUs -> ContactUsScreen()
                    AppRoute.AboutApp -> AboutAppScreen()
                    AppRoute.Pair -> Unit
                }

                if (state.loading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
            }
        }
    }
}

/** Drawer سمت راست با گزینه‌های ثابت پروژه. */
@Composable
private fun AppDrawer(
    merchant: Merchant?,
    selectedRoute: AppRoute,
    onNavigate: (AppRoute) -> Unit,
    onShare: () -> Unit,
    onLogout: () -> Unit,
) {
    ModalDrawerSheet {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = merchant?.storeName ?: "تلگرام CC",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            if (!merchant?.botUsername.isNullOrBlank()) {
                Text(
                    text = "@${merchant?.botUsername}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        DrawerRouteItem("داشبورد", Icons.Default.Dashboard, AppRoute.Dashboard, selectedRoute, onNavigate)
        DrawerRouteItem("محصولات", Icons.Default.ShoppingBag, AppRoute.Products, selectedRoute, onNavigate)
        DrawerRouteItem("سفارش‌ها", Icons.Default.ReceiptLong, AppRoute.Orders, selectedRoute, onNavigate)
        DrawerRouteItem("تنظیمات", Icons.Default.Settings, AppRoute.Settings, selectedRoute, onNavigate)

        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

        NavigationDrawerItem(
            label = { Text("معرفی به دوستان") },
            selected = false,
            icon = { Icon(Icons.Default.Share, contentDescription = null) },
            onClick = onShare,
        )
        DrawerRouteItem("درباره ما", Icons.Default.People, AppRoute.AboutUs, selectedRoute, onNavigate)
        DrawerRouteItem("تماس با ما", Icons.Default.Email, AppRoute.ContactUs, selectedRoute, onNavigate)
        DrawerRouteItem("درباره نرم‌افزار", Icons.Default.Info, AppRoute.AboutApp, selectedRoute, onNavigate)

        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

        NavigationDrawerItem(
            label = { Text("قطع اتصال اپ") },
            selected = false,
            icon = { Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null) },
            onClick = onLogout,
        )
    }
}

/** Helper یک گزینهٔ Routeدار Drawer. */
@Composable
private fun DrawerRouteItem(
    label: String,
    icon: ImageVector,
    route: AppRoute,
    selectedRoute: AppRoute,
    onNavigate: (AppRoute) -> Unit,
) {
    NavigationDrawerItem(
        label = { Text(label) },
        selected = selectedRoute == route,
        icon = { Icon(icon, contentDescription = null) },
        onClick = { onNavigate(route) },
    )
}

/** داشبورد آماری و اعلان نسخهٔ جدید. */
@Composable
private fun DashboardScreen(state: AppUiState, viewModel: AppViewModel) {
    val context = LocalContext.current
    val numberFormatter = remember { NumberFormat.getNumberInstance(Locale("fa", "IR")) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                text = "${state.merchant?.storeName ?: "فروشگاه"}، خوش آمدید",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
        }

        if (viewModel.hasUpdate()) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = "نسخهٔ ${state.versionInfo?.latestVersionName} آماده است",
                            fontWeight = FontWeight.Bold,
                        )
                        if (state.versionInfo?.forceUpdate == true) {
                            Text("این نسخه از طرف سرور به‌عنوان به‌روزرسانی ضروری علامت‌گذاری شده است.")
                        }
                        val url = state.versionInfo?.downloadUrl.orEmpty()
                        Button(
                            onClick = {
                                if (url.isNotBlank()) {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                }
                            },
                            enabled = url.isNotBlank(),
                        ) {
                            Text("دریافت نسخه جدید")
                        }
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                StatCard("مشتری", state.dashboard.customersCount.toString(), Icons.Default.Person, Modifier.weight(1f))
                StatCard("محصول", state.dashboard.productsCount.toString(), Icons.Default.ShoppingBag, Modifier.weight(1f))
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                StatCard("سفارش", state.dashboard.ordersCount.toString(), Icons.Default.ReceiptLong, Modifier.weight(1f))
                StatCard(
                    "فروش ۳۰ روز",
                    "${numberFormatter.format(state.dashboard.sales30Days)} تومان",
                    Icons.Default.Storefront,
                    Modifier.weight(1f),
                )
            }
        }

        item {
            OutlinedButton(
                onClick = viewModel::refreshDashboard,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("به‌روزرسانی آمار")
            }
        }
    }
}

/** کارت کوچک آمار داشبورد. */
@Composable
private fun StatCard(
    title: String,
    value: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(icon, contentDescription = null)
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

/** مدیریت اولیه محصولات؛ ساخت و فعال/غیرفعال کردن از همین نسخه کار می‌کند. */
@Composable
private fun ProductsScreen(state: AppUiState, viewModel: AppViewModel) {
    var showAddDialog by rememberSaveable { mutableStateOf(false) }
    val numberFormatter = remember { NumberFormat.getNumberInstance(Locale("fa", "IR")) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("محصول جدید")
            }
            OutlinedButton(onClick = viewModel::refreshProducts) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("تازه‌سازی")
            }
        }

        if (state.products.isEmpty() && !state.loading) {
            EmptyState("هنوز محصولی ثبت نشده است.")
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(state.products, key = { it.id }) { product ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(product.name, fontWeight = FontWeight.Bold)
                            if (product.description.isNotBlank()) {
                                Text(product.description, style = MaterialTheme.typography.bodySmall)
                            }
                            Spacer(Modifier.height(8.dp))
                            Text("${numberFormatter.format(product.price)} تومان")
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(if (product.isActive) "فعال" else "غیرفعال")
                                Switch(
                                    checked = product.isActive,
                                    onCheckedChange = { viewModel.setProductActive(product, it) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddProductDialog(
            onDismiss = { showAddDialog = false },
            onSave = { name, price, description ->
                showAddDialog = false
                viewModel.createProduct(name, price, description)
            },
        )
    }
}

/** Dialog افزودن محصول با Validation اولیه قیمت. */
@Composable
private fun AddProductDialog(
    onDismiss: () -> Unit,
    onSave: (String, Long, String) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var priceText by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("افزودن محصول") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("نام محصول") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = priceText,
                    onValueChange = { priceText = it.filter(Char::isDigit) },
                    label = { Text("قیمت (تومان)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("توضیحات") },
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(name, priceText.toLongOrNull() ?: 0L, description) },
                enabled = name.isNotBlank() && priceText.toLongOrNull() != null,
            ) {
                Text("ذخیره")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) { Text("انصراف") }
        },
    )
}

/** لیست سفارش‌ها و تغییر سریع Status. */
@Composable
private fun OrdersScreen(state: AppUiState, viewModel: AppViewModel) {
    val numberFormatter = remember { NumberFormat.getNumberInstance(Locale("fa", "IR")) }

    if (state.orders.isEmpty() && !state.loading) {
        EmptyState("هنوز سفارشی ثبت نشده است.")
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            OutlinedButton(onClick = viewModel::refreshOrders) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("تازه‌سازی سفارش‌ها")
            }
        }

        items(state.orders, key = { it.id }) { order ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = order.customerName.ifBlank { "مشتری" },
                        fontWeight = FontWeight.Bold,
                    )
                    if (order.customerUsername.isNotBlank()) Text("@${order.customerUsername}")
                    Text("مبلغ: ${numberFormatter.format(order.totalAmount)} تومان")
                    if (order.phone.isNotBlank()) Text("تلفن: ${order.phone}")
                    if (order.address.isNotBlank()) Text("آدرس: ${order.address}")
                    OrderStatusMenu(order = order, onStatus = { viewModel.updateOrderStatus(order, it) })
                }
            }
        }
    }
}

/** منوی وضعیت سفارش؛ مقادیر دقیقاً با constraint دیتابیس هماهنگ‌اند. */
@Composable
private fun OrderStatusMenu(order: Order, onStatus: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val statuses = listOf(
        "pending" to "در انتظار",
        "paid" to "پرداخت‌شده",
        "shipped" to "ارسال‌شده",
        "cancelled" to "لغوشده",
    )
    val currentLabel = statuses.firstOrNull { it.first == order.status }?.second ?: order.status

    Box {
        FilledTonalButton(onClick = { expanded = true }) {
            Text("وضعیت: $currentLabel")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            statuses.forEach { (value, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    onClick = {
                        expanded = false
                        onStatus(value)
                    },
                )
            }
        }
    }
}

/** تنظیمات فروشگاه + بخش اعلان‌ها طبق ساختار استاندارد برنامه. */
@Composable
private fun SettingsScreen(state: AppUiState, viewModel: AppViewModel) {
    val merchant = state.merchant ?: return
    var storeName by rememberSaveable(merchant.id, merchant.storeName) { mutableStateOf(merchant.storeName) }
    var mandatoryChannel by rememberSaveable(merchant.id, merchant.mandatoryChannel) { mutableStateOf(merchant.mandatoryChannel) }
    var reportChannel by rememberSaveable(merchant.id, merchant.reportChannel) { mutableStateOf(merchant.reportChannel) }
    var supportLink by rememberSaveable(merchant.id, merchant.supportLink) { mutableStateOf(merchant.supportLink) }
    var referralPercent by rememberSaveable(merchant.id, merchant.referralPercent) {
        mutableStateOf(merchant.referralPercent.toString())
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("تنظیمات فروشگاه", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

        OutlinedTextField(
            value = storeName,
            onValueChange = { storeName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("نام فروشگاه") },
        )
        OutlinedTextField(
            value = mandatoryChannel,
            onValueChange = { mandatoryChannel = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("کانال عضویت اجباری") },
        )
        OutlinedTextField(
            value = reportChannel,
            onValueChange = { reportChannel = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("کانال گزارش سفارش") },
        )
        OutlinedTextField(
            value = supportLink,
            onValueChange = { supportLink = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("لینک پشتیبانی") },
        )
        OutlinedTextField(
            value = referralPercent,
            onValueChange = { referralPercent = it.filter { char -> char.isDigit() || char == '.' } },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("درصد پورسانت معرفی") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        )

        Button(
            onClick = {
                viewModel.saveSettings(
                    storeName = storeName,
                    mandatoryChannel = mandatoryChannel,
                    reportChannel = reportChannel,
                    supportLink = supportLink,
                    referralPercent = referralPercent.toDoubleOrNull()?.coerceIn(0.0, 100.0) ?: 0.0,
                )
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("ذخیره تنظیمات")
        }

        HorizontalDivider()

        Text("اعلان‌ها", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        ListItem(
            headlineContent = { Text("دریافت اعلان‌های مدیریتی") },
            supportingContent = { Text("زیرساخت Push در نسخه بعدی به همین تنظیم متصل می‌شود.") },
            leadingContent = { Icon(Icons.Default.Notifications, contentDescription = null) },
            trailingContent = {
                Switch(
                    checked = state.notificationsEnabled,
                    onCheckedChange = viewModel::setNotificationsEnabled,
                )
            },
        )

        Text(
            text = "سرور متصل: ${state.baseUrl}",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

/** صفحه درباره ما؛ متن ساده و وسط‌چین. */
@Composable
private fun AboutUsScreen() {
    InfoPage(
        title = "گروه توسعه و برنامه نویسی AS Team",
        body = "تمامی حقوق مربوط به این برنامه انحصاری میباشد",
    )
}

/** صفحه تماس با ما با ایمیل پشتیبانی پروژه. */
@Composable
private fun ContactUsScreen() {
    InfoPage(
        title = "گروه توسعه و برنامه نویسی AS Team",
        body = "ایمیل پشتیبانی\nas.team.support@gmail.com",
    )
}

/** صفحه درباره نرم‌افزار؛ عمداً package name یا اطلاعات فنی اضافه نمایش داده نمی‌شود. */
@Composable
private fun AboutAppScreen() {
    InfoPage(
        title = "تلگرام CC",
        body = "پنل اندرویدی مدیریت فروشگاه تلگرامی برای مشاهده آمار، محصولات، سفارش‌ها و تنظیمات فروشگاه.\n\nنسخه ${BuildConfig.VERSION_NAME}",
    )
}

/** صفحه متنی مشترک برای About/Contact. */
@Composable
private fun InfoPage(title: String, body: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(body, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

/** Empty state صفحات لیستی. */
@Composable
private fun EmptyState(message: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(message, style = MaterialTheme.typography.bodyLarge)
    }
}

/** عنوان AppBar هر Route. */
private fun routeTitle(route: AppRoute): String = when (route) {
    AppRoute.Pair -> "اتصال"
    AppRoute.Dashboard -> "داشبورد"
    AppRoute.Products -> "محصولات"
    AppRoute.Orders -> "سفارش‌ها"
    AppRoute.Settings -> "تنظیمات"
    AppRoute.AboutUs -> "درباره ما"
    AppRoute.ContactUs -> "تماس با ما"
    AppRoute.AboutApp -> "درباره نرم‌افزار"
}
