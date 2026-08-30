// =============================================================================
// app/build.gradle.kts
// تنظیمات ساخت ماژول اصلی Android و امضای پایدار نسخه Release.
//
// نکته امنیتی: فایل Keystore و رمزهای آن هرگز داخل Repository قرار نمی‌گیرند.
// در CI مسیر Keystore و رمزها از GitHub Actions Secrets به Environment Variables
// تبدیل می‌شوند؛ بنابراین نسخه‌های بعدی می‌توانند با همان کلید روی نسخه قبلی نصب شوند.
// =============================================================================
plugins {
    // پلاگین اصلی ساخت اپ اندروید.
    id("com.android.application")
    // پلاگین رسمی Compose Compiler برای Kotlin 2.x.
    id("org.jetbrains.kotlin.plugin.compose")
}

// اطلاعات امضای Release فقط از Environment خوانده می‌شوند و در سورس ذخیره نمی‌شوند.
val releaseKeystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
val releaseKeystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = System.getenv("ANDROID_KEY_ALIAS")
val releaseKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")

// فقط وقتی هر چهار مقدار موجود باشند SigningConfig واقعی ساخته می‌شود.
val hasReleaseSigning = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

android {
    // namespace پایدار است تا کلاس‌های R/BuildConfig و آپدیت‌های آینده سازگار بمانند.
    namespace = "ir.asteam.telegramcc"
    // Android 16 / API 36.
    compileSdk = 36

    defaultConfig {
        // applicationId باید در تمام نسخه‌های آینده ثابت بماند تا Update ممکن باشد.
        applicationId = "ir.asteam.telegramcc"
        // Android 8.0 به بالا؛ سطح مناسب برای Keystore و APIهای مدرن.
        minSdk = 26
        // هدف انتشار فعلی Android 16.
        targetSdk = 36

        // نسخه Production جدید بعد از عملیاتی‌شدن Worker + Supabase + اتصال BotFather.
        versionCode = 2
        versionName = "1.1.0"

        // آدرس Backend رسمی پروژه داخل Build قرار می‌گیرد تا کاربر هیچ‌وقت
        // Worker/Cloudflare/URL را نبیند یا دستی وارد نکند. این URL Secret نیست.
        buildConfigField(
            "String",
            "BACKEND_BASE_URL",
            "\"https://app-telegram-cc.bustling-larch.workers.dev\"",
        )

        // Runner پیش‌فرض تست‌های Instrumented.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // SigningConfig فقط در محیط Release CI که Secretها حاضرند ساخته می‌شود.
    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(requireNotNull(releaseKeystorePath))
                storePassword = requireNotNull(releaseKeystorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
                // امضای V1/V2/V3 توسط Android Gradle Plugin/Build Tools مدیریت می‌شود.
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    buildFeatures {
        // رابط کاربری کاملاً با Jetpack Compose ساخته می‌شود.
        compose = true
        // برای نمایش versionName و BACKEND_BASE_URL داخل BuildConfig نیاز داریم.
        buildConfig = true
    }

    compileOptions {
        // AGP شاخه فعلی با JDK 17 پایدار است.
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        debug {
            // Debug فقط برای QA است و نسخه قابل انتشار محسوب نمی‌شود.
            isDebuggable = true
        }

        release {
            // نسخه Publish نباید Debuggable باشد.
            isDebuggable = false

            // فعلاً R8 خاموش است تا نسخه 1.1.0 با کمترین ریسک رفتاری منتشر شود.
            // بعد از پوشش تست UI می‌توان Minify/Resource Shrinking را فعال کرد.
            isMinifyEnabled = false

            // در CI تولید نهایی، SigningConfig پایدار اعمال می‌شود.
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    packaging {
        resources {
            // فایل‌های مجوز تکراری برخی dependencyها در APK لازم نیستند.
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // BOM پایدار Compose سازگار با compileSdk 36.
    val composeBom = platform("androidx.compose:compose-bom:2025.08.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    // Dependencyهای پایه Android/Compose.
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
