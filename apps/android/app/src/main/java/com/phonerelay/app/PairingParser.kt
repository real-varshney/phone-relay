package com.phonerelay.app

import android.net.Uri

object PairingParser {
    data class Pairing(val host: String, val code: String)

    fun parse(raw: String): Pairing? {
        val text = raw.trim()
        if (text.isBlank()) return null

        runCatching {
            val uri = Uri.parse(text)
            if (uri.scheme == "http" || uri.scheme == "https") {
                val code = uri.getQueryParameter("code")?.digitsOnly()?.takeIf { it.length == 6 }
                    ?: return null
                val port = uri.port
                val base = when {
                    port == -1 || (uri.scheme == "https" && port == 443) || (uri.scheme == "http" && port == 80) ->
                        "${uri.scheme}://${uri.host}"
                    else -> "${uri.scheme}://${uri.host}:$port"
                }
                return Pairing(base, code)
            }
        }

        val digits = text.digitsOnly()
        if (digits.length == 6 && !text.contains("://")) {
            return null
        }
        return null
    }

    fun formatCode(raw: String): String {
        val d = raw.digitsOnly().take(6)
        return if (d.length > 3) "${d.take(3)}-${d.drop(3)}" else d
    }

    private fun String.digitsOnly(): String = replace(Regex("\\D"), "")
}
