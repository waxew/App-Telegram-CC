// =============================================================================
// ui/OrderScreens.kt
// صفحات مدیریت سفارش‌های فروشگاه در اپ Android.
//
// این فایل دو صفحه مستقل دارد:
//   1) OrderManagementScreen: فهرست سفارش‌ها + ورود به جزئیات.
//   2) OrderDetailScreen: اطلاعات کامل مشتری، ارسال، مبالغ، اقلام و وضعیت سفارش.
//
// UI هیچ Query مستقیمی به دیتابیس نمی‌زند. تمام داده‌ها از ViewModel و API امن
// Merchant-scoped دریافت می‌شوند تا یک فروشگاه نتواند سفارش فروشگاه دیگر را ببیند.
// =============================================================================
package ir.asteam.telegramcc.ui

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ir.asteam.telegramcc.data.Order
import ir.asteam.telegramcc.data.OrderDetail
import ir.asteam.telegramcc.data.OrderItem
import java.text.NumberFormat
import java.util.Locale

/**
 * فهرست سفارش‌ها.
 * هر کارت خلاصه سفارش را نشان می‌دهد و کاربر با دکمه جزئیات وارد صفحه کامل می‌شود.
 */
@Composable
internal fun OrderManagementScreen(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    // Formatter واحد برای مبالغ تا نمایش همه اعداد در صفحه یکدست باشد.
    val numberFormatter = remember { NumberFormat.getNumberInstance(Locale("fa", "IR")) }

    if (state.orders.isEmpty() && !state.loading) {
        // اگر سفارش وجود ندارد، همچنان دکمه تازه‌سازی در اختیار کاربر است.
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("هنوز سفارشی ثبت نشده است.")
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = viewModel::refreshOrders) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("تازه‌سازی")
            }
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // اکشن Refresh بالای لیست قرار دارد.
        item {
            OutlinedButton(onClick = viewModel::refreshOrders) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("تازه‌سازی سفارش‌ها")
            }
        }

        items(state.orders, key = { it.id }) { order ->
            OrderSummaryCard(
                order = order,
                formattedTotal = numberFormatter.format(order.totalAmount),
                onOpen = { viewModel.openOrder(order) },
            )
        }
    }
}

/** کارت خلاصه سفارش در فهرست. */
@Composable
private fun OrderSummaryCard(
    order: Order,
    formattedTotal: String,
    onOpen: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // نام مشتری در اولویت است؛ اگر خالی باشد عنوان عمومی نشان داده می‌شود.
            Text(
                text = order.customerName.ifBlank { "مشتری" },
                fontWeight = FontWeight.Bold,
            )

            // Username فقط در صورت وجود نمایش داده می‌شود.
            if (order.customerUsername.isNotBlank()) {
                Text("@${order.customerUsername}", style = MaterialTheme.typography.bodySmall)
            }

            Text("مبلغ نهایی: $formattedTotal تومان")
            Text("وضعیت: ${orderStatusLabel(order.status)}")

            // ورود به صفحه جزئیات؛ خود ViewModel سفارش را از API دوباره می‌خواند.
            OutlinedButton(
                onClick = onOpen,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("مشاهده جزئیات سفارش")
            }
        }
    }
}

/**
 * صفحه کامل یک سفارش.
 * داده‌های این صفحه Snapshot ثبت‌شده سفارش هستند، بنابراین تغییر نام/قیمت محصول
 * در آینده نباید اطلاعات سفارش قدیمی را تغییر دهد.
 */
@Composable
internal fun OrderDetailScreen(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    val detail = state.orderDetail

    // اگر Route قبل از آماده‌شدن داده نمایش داده شد، Placeholder خنثی نشان می‌دهیم.
    if (detail == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("جزئیات سفارش در دسترس نیست.")
        }
        return
    }

    val numberFormatter = remember { NumberFormat.getNumberInstance(Locale("fa", "IR")) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // ---------------------------------------------------------------------
        // اطلاعات مشتری و ارسال.
        // ---------------------------------------------------------------------
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Text("اطلاعات سفارش", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("مشتری: ${detail.customerName.ifBlank { "بدون نام" }}")
                    if (detail.customerUsername.isNotBlank()) Text("تلگرام: @${detail.customerUsername}")
                    if (detail.phone.isNotBlank()) Text("تلفن: ${detail.phone}")
                    if (detail.deliveryMethod.isNotBlank()) Text("روش ارسال: ${detail.deliveryMethod}")
                    if (detail.address.isNotBlank()) Text("آدرس: ${detail.address}")
                    if (detail.createdAt.isNotBlank()) Text("زمان ثبت: ${detail.createdAt}")
                }
            }
        }

        // ---------------------------------------------------------------------
        // وضعیت سفارش؛ تغییر Status از همین صفحه انجام می‌شود.
        // ---------------------------------------------------------------------
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("وضعیت سفارش", fontWeight = FontWeight.Bold)
                    DetailStatusMenu(
                        detail = detail,
                        onStatus = viewModel::updateOrderDetailStatus,
                    )
                }
            }
        }

        // ---------------------------------------------------------------------
        // اقلام سفارش.
        // ---------------------------------------------------------------------
        item {
            Text("اقلام سفارش", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }

        if (detail.items.isEmpty()) {
            item {
                Text("برای این سفارش قلمی ثبت نشده است.")
            }
        } else {
            items(detail.items, key = { it.id }) { item ->
                OrderItemCard(item = item, numberFormatter = numberFormatter)
            }
        }

        // ---------------------------------------------------------------------
        // خلاصه مالی؛ تخفیف فقط وقتی مقدار دارد نمایش برجسته می‌شود.
        // ---------------------------------------------------------------------
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("خلاصه مالی", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    MoneyRow("جمع محصولات", detail.subtotalAmount, numberFormatter)
                    if (detail.discountAmount > 0L) {
                        MoneyRow("تخفیف", -detail.discountAmount, numberFormatter)
                    }
                    HorizontalDivider()
                    MoneyRow("مبلغ نهایی", detail.totalAmount, numberFormatter, bold = true)
                }
            }
        }

        // Refresh مستقل برای زمانی که وضعیت/اطلاعات سفارش بیرون از اپ تغییر کرده باشد.
        item {
            OutlinedButton(
                onClick = viewModel::refreshOrderDetail,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("تازه‌سازی جزئیات")
            }
        }
    }
}

/** کارت یک قلم سفارش با قیمت واحد، تعداد و جمع همان ردیف. */
@Composable
private fun OrderItemCard(
    item: OrderItem,
    numberFormatter: NumberFormat,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Text(item.productName, fontWeight = FontWeight.Bold)
            Text("تعداد: ${item.quantity}")
            Text("قیمت واحد: ${numberFormatter.format(item.unitPrice)} تومان")
            Text(
                "جمع: ${numberFormatter.format(item.lineTotal)} تومان",
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

/** منوی تغییر وضعیت در صفحه جزئیات. */
@Composable
private fun DetailStatusMenu(
    detail: OrderDetail,
    onStatus: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val statuses = listOf(
        "pending" to "در انتظار",
        "paid" to "پرداخت‌شده",
        "shipped" to "ارسال‌شده",
        "cancelled" to "لغوشده",
    )

    Box {
        FilledTonalButton(onClick = { expanded = true }) {
            Text("وضعیت: ${orderStatusLabel(detail.status)}")
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            statuses.forEach { (value, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    onClick = {
                        expanded = false
                        if (value != detail.status) onStatus(value)
                    },
                )
            }
        }
    }
}

/** یک ردیف مبلغ با امکان نمایش Bold. */
@Composable
private fun MoneyRow(
    label: String,
    amount: Long,
    numberFormatter: NumberFormat,
    bold: Boolean = false,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)
        Text(
            text = "${numberFormatter.format(amount)} تومان",
            fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
        )
    }
}

/** تبدیل Status داخلی Backend به متن قابل فهم فارسی. */
private fun orderStatusLabel(status: String): String = when (status) {
    "pending" -> "در انتظار"
    "paid" -> "پرداخت‌شده"
    "shipped" -> "ارسال‌شده"
    "cancelled" -> "لغوشده"
    else -> status
}
