// =============================================================================
// ui/CategoryManagementScreen.kt
// صفحه مدیریت دسته‌بندی‌های فروشگاه: ساخت، ویرایش، ترتیب، وضعیت و حذف.
// تمام عملیات از ViewModel به API امن Merchant-scoped ارسال می‌شوند.
// =============================================================================
package ir.asteam.telegramcc.ui

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import ir.asteam.telegramcc.data.Category

/** صفحه اصلی مدیریت دسته‌بندی‌ها. */
@Composable
internal fun CategoryManagementScreen(state: AppUiState, viewModel: AppViewModel) {
    // Dialog ساخت فقط هنگام درخواست کاربر در Composition قرار می‌گیرد.
    var showAddDialog by rememberSaveable { mutableStateOf(false) }
    // دسته‌بندی انتخاب‌شده برای ویرایش؛ null یعنی Dialog ویرایش بسته است.
    var editingCategory by rememberSaveable { mutableStateOf<String?>(null) }
    // دسته‌بندی انتخاب‌شده برای حذف؛ حذف فقط بعد از تأیید کاربر انجام می‌شود.
    var deletingCategory by rememberSaveable { mutableStateOf<String?>(null) }

    val editTarget = state.categories.firstOrNull { it.id == editingCategory }
    val deleteTarget = state.categories.firstOrNull { it.id == deletingCategory }

    Column(modifier = Modifier.fillMaxSize()) {
        // اکشن‌های اصلی همیشه بالای لیست در دسترس هستند.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("دسته جدید")
            }
            OutlinedButton(onClick = viewModel::refreshCategories) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("تازه‌سازی")
            }
        }

        if (state.categories.isEmpty() && !state.loading) {
            // Empty State محلی تا این فایل به تابع private فایل اصلی وابسته نباشد.
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("هنوز دسته‌بندی‌ای ثبت نشده است.")
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(state.categories, key = { it.id }) { category ->
                    CategoryCard(
                        category = category,
                        onActiveChanged = { viewModel.setCategoryActive(category, it) },
                        onEdit = { editingCategory = category.id },
                        onDelete = { deletingCategory = category.id },
                    )
                }
            }
        }
    }

    if (showAddDialog) {
        CategoryEditorDialog(
            title = "افزودن دسته‌بندی",
            initialName = "",
            initialSortOrder = 0,
            onDismiss = { showAddDialog = false },
            onSave = { name, _ ->
                showAddDialog = false
                viewModel.createCategory(name)
            },
        )
    }

    if (editTarget != null) {
        CategoryEditorDialog(
            title = "ویرایش دسته‌بندی",
            initialName = editTarget.name,
            initialSortOrder = editTarget.sortOrder,
            onDismiss = { editingCategory = null },
            onSave = { name, sortOrder ->
                editingCategory = null
                viewModel.updateCategory(editTarget, name, sortOrder)
            },
        )
    }

    if (deleteTarget != null) {
        AlertDialog(
            onDismissRequest = { deletingCategory = null },
            title = { Text("حذف دسته‌بندی") },
            text = { Text("دسته‌بندی «${deleteTarget.name}» حذف شود؟ این عملیات قابل بازگشت نیست.") },
            confirmButton = {
                Button(
                    onClick = {
                        deletingCategory = null
                        viewModel.deleteCategory(deleteTarget)
                    },
                ) {
                    Text("حذف")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { deletingCategory = null }) {
                    Text("انصراف")
                }
            },
        )
    }
}

/** کارت هر دسته‌بندی با وضعیت و اکشن‌های مدیریتی. */
@Composable
private fun CategoryCard(
    category: Category,
    onActiveChanged: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(category.name, fontWeight = FontWeight.Bold)
            Text(
                text = "ترتیب نمایش: ${category.sortOrder}",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(if (category.isActive) "فعال" else "غیرفعال")
                Switch(
                    checked = category.isActive,
                    onCheckedChange = onActiveChanged,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onEdit) { Text("ویرایش") }
                OutlinedButton(onClick = onDelete) { Text("حذف") }
            }
        }
    }
}

/** Dialog مشترک ساخت/ویرایش با کنترل نام و ترتیب نمایش. */
@Composable
private fun CategoryEditorDialog(
    title: String,
    initialName: String,
    initialSortOrder: Int,
    onDismiss: () -> Unit,
    onSave: (String, Int) -> Unit,
) {
    var name by rememberSaveable(initialName) { mutableStateOf(initialName) }
    var sortOrderText by rememberSaveable(initialSortOrder) { mutableStateOf(initialSortOrder.toString()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(120) },
                    label = { Text("نام دسته‌بندی") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = sortOrderText,
                    onValueChange = { value ->
                        sortOrderText = value.filter(Char::isDigit).take(6)
                    },
                    label = { Text("ترتیب نمایش") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(name, sortOrderText.toIntOrNull() ?: 0) },
                enabled = name.isNotBlank(),
            ) {
                Text("ذخیره")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) { Text("انصراف") }
        },
    )
}
