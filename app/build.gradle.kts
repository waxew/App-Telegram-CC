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
    // API 37 با AGP 9.3 پشتیبانی می‌شود.
    compileSdk = 37

    defaultConfig {
        // applicationId از همین نسخه ثابت می‌ماند تا نسخه‌های بعد روی نسخه قبلی نصب شوند.
        applicationId = "ir.asteam.telegramcc"
        // Android 8.0 به بالا؛ سطح مناسبی برای Keystore و APIهای مدرن است.
        minSdk = 26
        // هدف انتشار فعلی پروژه.
        targetSdk = 37
        // هر انتشار جدید باید versionCode بزرگ‌تری داشته باشد.
        versionCode = 1
        // نسخهٔ قابل نمایش برای کاربر.
        versionName = "1.0.0"

        // Runner پیش‌فرض تست‌های Instrumented.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        // رابط کاربری کاملاً با Jetpack Compose ساخته می‌شود.
        compose = true
        // برای نمایش versionName داخل صفحه «درباره نرم‌افزار» به BuildConfig نیاز داریم.
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
    // BOM همه کتابخانه‌های Compose را روی نسخه‌های سازگار با هم نگه می‌دارد.
    val composeBom = platform("androidx.compose:compose-bom:2026.08.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    // پایه‌های AndroidX و Compose.
    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")

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
