// =============================================================================
// data/SecurePreferences.kt
// نگهداری تنظیمات محلی و Bearer Session به‌صورت رمز‌شده با Android Keystore.
// =============================================================================
package ir.asteam.telegramcc.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * تنظیمات پایدار اپ.
 * URL و سوییچ اعلان Secret نیستند، ولی sessionToken حتماً رمز می‌شود.
 */
class SecurePreferences(context: Context) {

    // SharedPreferences فقط Container ذخیره‌سازی است؛ توکن داخل آن plaintext نیست.
    private val preferences = context.getSharedPreferences("telegram_cc_preferences", Context.MODE_PRIVATE)

    // Alias ثابت باعث می‌شود نسخه‌های بعدی همان کلید Keystore را استفاده کنند.
    private val keyAlias = "telegram_cc_session_key_v1"

    /** URL پایه Worker، بدون slash انتهایی. */
    var baseUrl: String
        get() = preferences.getString("base_url", "") ?: ""
        set(value) {
            preferences.edit().putString("base_url", value.trim().trimEnd('/')).apply()
        }

    /** وضعیت ترجیح کاربر برای اعلان‌ها؛ زیرساخت Push در فاز بعدی به آن وصل می‌شود. */
    var notificationsEnabled: Boolean
        get() = preferences.getBoolean("notifications_enabled", true)
        set(value) {
            preferences.edit().putBoolean("notifications_enabled", value).apply()
        }

    /** توکن نشست را با AES/GCM رمز می‌کند و ciphertext + IV را ذخیره می‌کند. */
    fun saveSessionToken(token: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())

        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val iv = cipher.iv

        preferences.edit()
            .putString("session_ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString("session_iv", Base64.encodeToString(iv, Base64.NO_WRAP))
            .apply()
    }

    /** توکن نشست را فقط در حافظهٔ فرایند Decrypt می‌کند؛ در Log چاپ نمی‌شود. */
    fun readSessionToken(): String? {
        val encryptedText = preferences.getString("session_ciphertext", null) ?: return null
        val ivText = preferences.getString("session_iv", null) ?: return null

        return runCatching {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val iv = Base64.decode(ivText, Base64.NO_WRAP)
            val encrypted = Base64.decode(encryptedText, Base64.NO_WRAP)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        }.getOrNull()
    }

    /** خروج از حساب فقط Credential را پاک می‌کند؛ تنظیمات غیرحساس حفظ می‌شوند. */
    fun clearSession() {
        preferences.edit()
            .remove("session_ciphertext")
            .remove("session_iv")
            .apply()
    }

    /** کلید AES را از AndroidKeyStore می‌خواند یا اولین بار تولید می‌کند. */
    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existingKey = keyStore.getKey(keyAlias, null) as? SecretKey
        if (existingKey != null) return existingKey

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        val spec = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()

        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }
}
