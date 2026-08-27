// =============================================================================
// build.gradle.kts (Project)
// نسخه‌های Build System کل پروژه را در یک نقطه ثابت نگه می‌دارد.
// =============================================================================
plugins {
    // Android Gradle Plugin 9.3 از API 37 پشتیبانی می‌کند.
    id("com.android.application") version "9.3.0" apply false

    // Compose Compiler باید هم‌نسخه با Kotlin مورد استفادهٔ Build باشد.
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.10" apply false
}

// AGP 9 از Built-in Kotlin استفاده می‌کند. با این classpath نسخهٔ Kotlin آن را
// به 2.4.10 ارتقا می‌دهیم؛ بنابراین kotlin-android جداگانه اعمال نمی‌شود.
buildscript {
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.10")
    }
}
