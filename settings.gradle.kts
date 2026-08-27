// =============================================================================
// settings.gradle.kts
// فایل ورودی Gradle: مخزنهای وابستگی و ماژول Android را معرفی می‌کند.
// =============================================================================
pluginManagement {
    repositories {
        // پلاگین Android و Compose از مخزن رسمی Google دریافت می‌شوند.
        google()
        // پلاگین‌های Kotlin و سایر پلاگین‌های Gradle از این مخزن می‌آیند.
        gradlePluginPortal()
        // برخی وابستگی‌های JVM در Maven Central منتشر می‌شوند.
        mavenCentral()
    }
}

dependencyResolutionManagement {
    // جلوگیری از تعریف repositoryهای پراکنده در ماژول‌ها، برای Build قابل‌پیش‌بینی‌تر.
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

// نام نمایشی پروژه در Android Studio.
rootProject.name = "App-Telegram-CC"

// ماژول اپلیکیشن اندروید.
include(":app")
