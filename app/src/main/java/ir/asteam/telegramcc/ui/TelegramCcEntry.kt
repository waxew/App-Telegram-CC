// =============================================================================
// ui/TelegramCcEntry.kt
// ورودی واقعی نسخهٔ کاربر نهایی.
//
// کاربر فقط BotFather Token ربات خودش را وارد می‌کند. هیچ آدرس Worker،
// Cloudflare URL یا کد ۸ کاراکتری در UI نمایش داده نمی‌شود. اگر Session امن
// قبلی معتبر باشد، این صفحه اصلاً نمایش داده نمی‌شود و اپ مستقیم وارد داشبورد
// می‌شود. بعد از اتصال نیز همان UI کامل قبلی برای مدیریت فروشگاه استفاده می‌شود.
// =============================================================================
package ir.asteam.telegramcc.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Root جدید اپ.
 * در حالت بدون Session صفحه Token را نشان می‌دهد؛ بعد از اتصال به UI اصلی می‌رود.
 */
@Composable
fun TelegramCcEntry(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    if (state.route != AppRoute.Pair) {
        // UI کامل مدیریت فروشگاه بعد از ورود بدون تغییر استفاده می‌شود.
        TelegramCcApp(viewModel = viewModel)
        return
    }

    val darkTheme = androidx.compose.foundation.isSystemInDarkTheme()
    MaterialTheme(colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme()) {
        androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            Surface(modifier = Modifier.fillMaxSize()) {
                BotTokenConnectScreen(
                    state = state,
                    onConnect = viewModel::connectBot,
                    onMessageConsumed = viewModel::consumeMessages,
                )
            }
        }
    }
}

/** صفحه اتصال ساده‌ای که فقط Token BotFather را از کاربر می‌گیرد. */
@Composable
private fun BotTokenConnectScreen(
    state: AppUiState,
    onConnect: (String) -> Unit,
    onMessageConsumed: () -> Unit,
) {
    var token by rememberSaveable { mutableStateOf("") }
    val snackbarHostState = remember { SnackbarHostState() }

    // هر خطا یا پیام Backend یک‌بار نمایش داده می‌شود و سپس از State پاک می‌شود.
    LaunchedEffect(state.errorMessage, state.infoMessage) {
        val message = state.errorMessage ?: state.infoMessage
        if (!message.isNullOrBlank()) {
            snackbarHostState.showSnackbar(message)
            onMessageConsumed()
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp, vertical = 28.dp),
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
                    text = "ربات فروشگاهی خودت را متصل کن",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )

                Text(
                    text = "در BotFather یک ربات بساز، توکن آن را کپی کن و اینجا وارد کن. بعد از تأیید، مستقیم وارد پنل مدیریت فروشگاه می‌شوی.",
                    style = MaterialTheme.typography.bodyMedium,
                )

                Spacer(modifier = Modifier.height(4.dp))

                OutlinedTextField(
                    value = token,
                    onValueChange = { value ->
                        // Space و خط جدید ناخواسته از Copy/Paste حذف می‌شود، ولی ساختار Token دست‌نخورده می‌ماند.
                        token = value.replace("\n", "").replace("\r", "").trim()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("توکن ربات از BotFather") },
                    placeholder = { Text("123456789:AA...") },
                    leadingIcon = { Icon(Icons.Default.Key, contentDescription = null) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    enabled = !state.loading,
                )

                Button(
                    onClick = { onConnect(token) },
                    enabled = !state.loading && token.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.loading) {
                        CircularProgressIndicator()
                    } else {
                        Text("اتصال ربات")
                    }
                }

                Text(
                    text = "توکن فقط برای اتصال امن ربات به سرور استفاده می‌شود و داخل گوشی ذخیره نمی‌شود.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
