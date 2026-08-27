// =============================================================================
// MainActivity.kt
// Activity اصلی: فقط میزبان Compose است و منطق تجاری را داخل ViewModel نگه می‌دارد.
// =============================================================================
package ir.asteam.telegramcc

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import ir.asteam.telegramcc.ui.AppViewModel
import ir.asteam.telegramcc.ui.TelegramCcEntry

/**
 * نقطهٔ ورود اپ اندروید.
 * صفحهٔ نخست جدید فقط BotFather Token را می‌گیرد و جزئیات زیرساخت را مخفی می‌کند.
 */
class MainActivity : ComponentActivity() {

    // ViewModel در تغییرات Configuration زنده می‌ماند و State صفحه را حفظ می‌کند.
    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // محتوا تا لبه‌های صفحه رسم می‌شود؛ Scaffold فاصلهٔ System Bar را مدیریت می‌کند.
        enableEdgeToEdge()

        // Entry جدید: Token BotFather → Session امن → داشبورد مدیریت.
        setContent {
            TelegramCcEntry(viewModel = viewModel)
        }
    }
}
