// =============================================================================
// ui/CustomerManagementScreen.kt
// صفحه مشاهده و جست‌وجوی مشتریان فروشگاه.
//
// این نسخه عمداً عملیات مالی/ویرایش موجودی کیف‌پول را از UI انجام نمی‌دهد؛
// کیف‌پول فقط نمایش داده می‌شود تا تغییر موجودی بدون Ledger و Audit Trail رخ ندهد.
// تمام اطلاعات از API Merchant-scoped دریافت می‌شوند.
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ir.asteam.telegramcc.data.Customer
import java.text.NumberFormat
import java.util.Locale

/** صفحه اصلی مشتریان با جست‌وجوی محلی روی داده دریافت‌شده از سرور. */
@Composable
internal fun CustomerManagementScreen(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    // متن جست‌وجو در Rotation/بازسازی Activity حفظ می‌شود.
    var query by rememberSaveable { mutableStateOf("") }
    val normalizedQuery = query.trim().lowercase()

    // فیلتر محلی باعث می‌شود برای هر حرف یک درخواست شبکه ایجاد نشود.
    val visibleCustomers = remember(state.customers, normalizedQuery) {
        if (normalizedQuery.isBlank()) {
            state.customers
        } else {
            state.customers.filter { customer ->
                customer.firstName.lowercase().contains(normalizedQuery) ||
                    customer.username.lowercase().contains(normalizedQuery) ||
                    customer.phone.lowercase().contains(normalizedQuery) ||
                    customer.telegramId.toString().contains(normalizedQuery)
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // جست‌وجو و Refresh در ابتدای صفحه قرار دارند.
        OutlinedTextField(
            value = query,
            onValueChange = { query = it.take(120) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            label = { Text("جست‌وجوی مشتری") },
            placeholder = { Text("نام، یوزرنیم، شماره یا شناسه تلگرام") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            singleLine = true,
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "${visibleCustomers.size} مشتری",
                style = MaterialTheme.typography.bodyMedium,
            )

            OutlinedButton(onClick = viewModel::refreshCustomers) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("تازه‌سازی")
            }
        }

        if (visibleCustomers.isEmpty() && !state.loading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (query.isBlank()) {
                        "هنوز مشتری‌ای ثبت نشده است."
                    } else {
                        "مشتری مطابق جست‌وجو پیدا نشد."
                    }
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(visibleCustomers, key = { it.id }) { customer ->
                    CustomerCard(customer)
                }
            }
        }
    }
}

/** کارت اطلاعات یک مشتری. */
@Composable
private fun CustomerCard(customer: Customer) {
    val numberFormatter = remember { NumberFormat.getNumberInstance(Locale("fa", "IR")) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Text(
                text = customer.firstName.ifBlank { "مشتری" },
                fontWeight = FontWeight.Bold,
            )

            if (customer.username.isNotBlank()) {
                Text("@${customer.username}")
            }

            // شناسه تلگرام برای تشخیص دقیق کاربران هم‌نام همیشه نمایش داده می‌شود.
            Text("شناسه تلگرام: ${customer.telegramId}")

            if (customer.phone.isNotBlank()) {
                Text("تلفن: ${customer.phone}")
            }

            if (customer.address.isNotBlank()) {
                Text("آدرس: ${customer.address}")
            }

            Text(
                text = "کیف‌پول: ${numberFormatter.format(customer.walletBalance)} تومان",
                fontWeight = FontWeight.Bold,
            )

            if (customer.createdAt.isNotBlank()) {
                Text(
                    text = "عضویت: ${customer.createdAt}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
