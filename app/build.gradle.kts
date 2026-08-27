// =============================================================================
// app/build.gradle.kts
// تنظیمات ساخت APK ماژول اصلی Android.
// =============================================================================
plugins {
    // پلاگین اصلی ساخت اپ اندروید.
    id("com.android.application")
    // پلاگین رسمی Compose Compiler برای Kotlin 2.x.
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    // namespace پایدار است تا کلاس‌های R/BuildConfig و آپدیت‌های آینده سازگار بمانند.
    namespace = "ir.asteam.telegramcc"
    // Android 16 پایدار در زمان این نسخه API 36 است.
    compileSdk = 36

    defaultConfig {
        // applicationId از همین نسخه ثابت می‌ماند تا نسخه‌های بعد روی نسخه قبلی نصب شوند.
        applicationId = "ir.asteam.telegramcc"
        // Android 8.0 به بالا؛ سطح مناسبی برای Keystore و APIهای مدرن است.
        minSdk = 26
        // هدف انتشار فعلی پروژه Android 16 پایدار است.
        targetSdk = 36
        // هر انتشار جدید باید versionCode بزرگ‌تری داشته باشد.
        versionCode = 1
        // نسخهٔ قابل نمایش برای کاربر.
        versionName = "1.0.0"

        // آدرس Backend رسمی پروژه داخل خود Build قرار می‌گیرد تا کاربر هیچ‌وقت
        // Worker/Cloudflare/URL را نبیند یا دستی وارد نکند. این URL Secret نیست.
        buildConfigField(
            "String",
            "BACKEND_BASE_URL",
            "\"https://app-telegram-cc.bustling-larch.workers.dev\"",
        )

        // Runner پیش‌فرض تست‌های Instrumented.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        // رابط کاربری کاملاً با Jetpack Compose ساخته می‌شود.
        compose = true
        // برای نمایش versionName و BACKEND_BASE_URL داخل BuildConfig نیاز داریم.
        buildConfig = true
    }

    compileOptions {
        // AGP 9.3 با JDK 17 سازگار است؛ Kotlin داخلی نیز target را از همین مقدار می‌گیرد.
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            // فعلاً R8 خاموش است تا نسخهٔ پایه با کمترین ریسک ساخته شود؛ قبل از انتشار نهایی
            // می‌توانیم Minify/Resource Shrinking را همراه تست کامل فعال کنیم.
            isMinifyEnabled = false
        }
    }

    packaging {
        resources {
            // فایل‌های مجوز تکراری برخی dependencyها در APK نهایی لازم نیستند.
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // BOM آگوست 2025 شامل شاخه پایدار Compose 1.9 است و با compileSdk 36 سازگار می‌ماند.
    val composeBom = platform("androidx.compose:compose-bom:2025.08.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    // این نسخه‌ها عمداً روی آخرین شاخه‌های پایدارِ سازگار با Android API 36 پین شده‌اند.
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")

    // UI Material 3 و مجموعه آیکون‌های Material برای Drawer و صفحات.
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // ابزار Preview فقط در Build دیباگ وارد APK می‌شود.
    debugImplementation("androidx.compose.ui:ui-tooling")

    // تست‌های پایه؛ در CI اجرا می‌شوند.
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
