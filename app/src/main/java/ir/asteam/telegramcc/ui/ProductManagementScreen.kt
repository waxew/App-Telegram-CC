// =============================================================================
// ui/ProductManagementScreen.kt
// صفحه مدیریت کامل محصولات در اپ Android.
//
// مسئولیت‌های این فایل:
//   1) نمایش محصولات و دسته‌بندی هر محصول.
//   2) ساخت محصول با انتخاب دسته‌بندی.
//   3) ویرایش نام، قیمت، توضیح و دسته‌بندی.
//   4) فعال/غیرفعال کردن سریع محصول.
//   5) حذف محصول فقط بعد از تأیید کاربر.
//
// هیچ عملیات دیتابیسی مستقیماً از UI انجام نمی‌شود؛ همه چیز از ViewModel به
// API امن Backend ارسال می‌شود تا merchant_id در سرور دوباره کنترل شود.
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import ir.asteam.telegramcc.data.Category
import ir.asteam.telegramcc.data.Product
import java.text.NumberFormat
import java.util.Locale

/** صفحه اصلی مدیریت محصولات. */
@Composable
internal fun ProductManagementScreen(state: AppUiState, viewModel: AppViewModel) {
    // Dialog افزودن فقط هنگام لمس دکمه «محصول جدید» نمایش داده می‌شود.
    var showAddDialog by rememberSaveable { mutableStateOf(false) }
    // شناسه محصولی که در حال ویرایش است؛ null یعنی Dialog ویرایش بسته است.
    var editingProductId by rememberSaveable { mutableStateOf<String?>(null) }
    // شناسه محصول انتخاب‌شده برای حذف؛ حذف بدون تأیید انجام نمی‌شود.
    var deletingProductId by rememberSaveable { mutableStateOf<String?>(null) }

    // از State فعلی محصول هدف را پیدا می‌کنیم تا پس از Refresh داده قدیمی استفاده نشود.
    val editTarget = state.products.firstOrNull { it.id == editingProductId }
    val deleteTarget = state.products.firstOrNull { it.id == deletingProductId }
    // Formatter فارسی برای نمایش قیمت بدون تغییر مقدار اصلی عددی.
    val numberFormatter = remember { NumberFormat.getNumberInstance(Locale("fa", "IR")) }

    Column(modifier = Modifier.fillMaxSize()) {
        // اکشن‌های اصلی بالای صفحه همیشه قابل دسترسی هستند.
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
            // Empty State مستقل از فایل اصلی تا این صفحه قابل نگهداری و تست بماند.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("هنوز محصولی ثبت نشده است.")
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(state.products, key = { it.id }) { product ->
                    // نام دسته‌بندی از لیست تازه State resolve می‌شود.
                    val categoryName = state.categories
                        .firstOrNull { it.id == product.categoryId }
                        ?.name
                        ?: "بدون دسته‌بندی"

                    ProductManagementCard(
                        product = product,
                        categoryName = categoryName,
                        formattedPrice = numberFormatter.format(product.price),
                        onActiveChanged = { active -> viewModel.setProductActive(product, active) },
                        onEdit = { editingProductId = product.id },
                        onDelete = { deletingProductId = product.id },
                    )
                }
            }
        }
    }

    // فرم ساخت محصول؛ دسته‌بندی اختیاری است.
    if (showAddDialog) {
        ProductEditorDialog(
            title = "افزودن محصول",
            categories = state.categories,
            initialName = "",
            initialPrice = 0L,
            initialDescription = "",
            initialCategoryId = null,
            onDismiss = { showAddDialog = false },
            onSave = { name, price, description, categoryId ->
                showAddDialog = false
                viewModel.createProduct(
                    name = name,
                    price = price,
                    description = description,
                    categoryId = categoryId,
                )
            },
        )
    }

    // فرم ویرایش از داده فعلی محصول پر می‌شود.
    if (editTarget != null) {
        ProductEditorDialog(
            title = "ویرایش محصول",
            categories = state.categories,
            initialName = editTarget.name,
            initialPrice = editTarget.price,
            initialDescription = editTarget.description,
            initialCategoryId = editTarget.categoryId,
            onDismiss = { editingProductId = null },
            onSave = { name, price, description, categoryId ->
                editingProductId = null
                viewModel.updateProduct(
                    product = editTarget,
                    name = name,
                    price = price,
                    description = description,
                    categoryId = categoryId,
                )
            },
        )
    }

    // حذف محصول عملیات مخرب است و حتماً تأیید دوم می‌گیرد.
    if (deleteTarget != null) {
        AlertDialog(
            onDismissRequest = { deletingProductId = null },
            title = { Text("حذف محصول") },
            text = {
                Text("محصول «${deleteTarget.name}» حذف شود؟ این عملیات قابل بازگشت نیست.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        deletingProductId = null
                        viewModel.deleteProduct(deleteTarget)
                    },
                ) {
                    Text("حذف")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { deletingProductId = null }) {
                    Text("انصراف")
                }
            },
        )
    }
}

/** کارت نمایشی هر محصول و اکشن‌های سریع مدیریتی. */
@Composable
private fun ProductManagementCard(
    product: Product,
    categoryName: String,
    formattedPrice: String,
    onActiveChanged: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            // نام محصول مهم‌ترین اطلاعات کارت است.
            Text(product.name, fontWeight = FontWeight.Bold)
            // دسته‌بندی برای تشخیص سریع محل محصول نمایش داده می‌شود.
            Text(
                text = "دسته‌بندی: $categoryName",
                style = MaterialTheme.typography.bodySmall,
            )
            // توضیح خالی فضای کارت را اشغال نمی‌کند.
            if (product.description.isNotBlank()) {
                Text(product.description, style = MaterialTheme.typography.bodySmall)
            }
            // قیمت همیشه از مقدار Long اصلی Format می‌شود.
            Text("$formattedPrice تومان")

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(if (product.isActive) "فعال" else "غیرفعال")
                Switch(
                    checked = product.isActive,
                    onCheckedChange = onActiveChanged,
                )
            }

            // ویرایش و حذف جدا هستند تا لمس اشتباه باعث حذف فوری نشود.
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onEdit) { Text("ویرایش") }
                OutlinedButton(onClick = onDelete) { Text("حذف") }
            }
        }
    }
}

/** فرم مشترک ساخت و ویرایش محصول. */
@Composable
private fun ProductEditorDialog(
    title: String,
    categories: List<Category>,
    initialName: String,
    initialPrice: Long,
    initialDescription: String,
    initialCategoryId: String?,
    onDismiss: () -> Unit,
    onSave: (String, Long, String, String?) -> Unit,
) {
    // مقادیر اولیه برای ویرایش حفظ می‌شوند و در ساخت خالی هستند.
    var name by rememberSaveable(initialName) { mutableStateOf(initialName) }
    var priceText by rememberSaveable(initialPrice) { mutableStateOf(initialPrice.toString()) }
    var description by rememberSaveable(initialDescription) { mutableStateOf(initialDescription) }
    var selectedCategoryId by rememberSaveable(initialCategoryId) {
        mutableStateOf<String?>(initialCategoryId)
    }
    // وضعیت باز/بسته بودن منوی انتخاب دسته‌بندی نیازی به ذخیره دائمی ندارد.
    var categoryMenuExpanded by remember { mutableStateOf(false) }

    // عنوان دسته انتخاب‌شده از State ورودی استخراج می‌شود.
    val selectedCategoryLabel = categories
        .firstOrNull { it.id == selectedCategoryId }
        ?.name
        ?: "بدون دسته‌بندی"

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(180) },
                    label = { Text("نام محصول") },
                    singleLine = true,
                )

                OutlinedTextField(
                    value = priceText,
                    onValueChange = { value -> priceText = value.filter(Char::isDigit).take(15) },
                    label = { Text("قیمت (تومان)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(4000) },
                    label = { Text("توضیحات") },
                    minLines = 2,
                    maxLines = 5,
                )

                // Dropdown ساده بدون dependency اضافه برای انتخاب دسته‌بندی.
                Box {
                    OutlinedButton(
                        onClick = { categoryMenuExpanded = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("دسته‌بندی: $selectedCategoryLabel")
                    }

                    DropdownMenu(
                        expanded = categoryMenuExpanded,
                        onDismissRequest = { categoryMenuExpanded = false },
                    ) {
                        // null به معنی محصول بدون دسته‌بندی است و Backend آن را پشتیبانی می‌کند.
                        DropdownMenuItem(
                            text = { Text("بدون دسته‌بندی") },
                            onClick = {
                                selectedCategoryId = null
                                categoryMenuExpanded = false
                            },
                        )

                        categories.forEach { category ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        if (category.isActive) {
                                            category.name
                                        } else {
                                            "${category.name} (غیرفعال)"
                                        }
                                    )
                                },
                                onClick = {
                                    selectedCategoryId = category.id
                                    categoryMenuExpanded = false
                                },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            // ذخیره فقط با نام معتبر و قیمت عددی فعال می‌شود.
            Button(
                onClick = {
                    onSave(
                        name.trim(),
                        priceText.toLongOrNull() ?: 0L,
                        description.trim(),
                        selectedCategoryId,
                    )
                },
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
