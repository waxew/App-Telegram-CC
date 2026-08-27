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
import ir.asteam.telegramcc.ui.TelegramCcApp

/**
 * نقطهٔ ورود اپ اندروید.
 * استفاده از یک Activity و چند Screen کامپوزی باعث ساده‌تر شدن Navigation و Back می‌شود.
 */
class MainActivity : ComponentActivity() {

    // ViewModel در تغییرات Configuration زنده می‌ماند و State صفحه را حفظ می‌کند.
    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // محتوا تا لبه‌های صفحه رسم می‌شود؛ Scaffold فاصلهٔ System Bar را مدیریت می‌کند.
        enableEdgeToEdge()

        // تمام UI از اینجا وارد Compose می‌شود.
        setContent {
            TelegramCcApp(viewModel = viewModel)
        }
    }
}
