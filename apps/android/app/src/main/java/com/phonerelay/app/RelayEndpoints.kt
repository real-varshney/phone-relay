package com.phonerelay.app

object RelayConfig {
    /** Hint for manual entry only — QR scan provides the real URL. */
    const val MANUAL_HOST_HINT = "https://…-3000.inc1.devtunnels.ms or 192.168.x.x:3000"
}

object RelayEndpoints {
    /** Use stored / scanned host as-is (QR is the source of truth). */
    fun resolveHost(input: String): String = normalizeHost(input)

    fun isPrivateLanHost(input: String): Boolean {
        val raw = input.trim().trimEnd('/')
        val withoutScheme = raw
            .removePrefix("https://")
            .removePrefix("http://")
            .removePrefix("wss://")
            .removePrefix("ws://")
        val hostPart = withoutScheme.substringBefore('/').substringBefore(':').lowercase()
        if (hostPart == "localhost" || hostPart == "127.0.0.1" || hostPart == "::1") return true
        val parts = hostPart.split('.').mapNotNull { it.toIntOrNull() }
        if (parts.size != 4) return false
        return when {
            parts[0] == 10 -> true
            parts[0] == 192 && parts[1] == 168 -> true
            parts[0] == 172 && parts[1] in 16..31 -> true
            parts[0] == 127 -> true
            else -> false
        }
    }

    /** Build wss/ws URL for the phone relay socket. */
    fun websocketUrl(hostOrUrl: String): String {
        val raw = normalizeHost(hostOrUrl).trim().trimEnd('/')
        if (raw.isBlank()) return ""
        when {
            raw.startsWith("wss://") || raw.startsWith("ws://") -> {
                return if (raw.endsWith("/ws/phone")) raw else "$raw/ws/phone"
            }
            raw.startsWith("https://") -> return raw.replaceFirst("https://", "wss://") + "/ws/phone"
            raw.startsWith("http://") -> return raw.replaceFirst("http://", "ws://") + "/ws/phone"
            else -> {
                val withPort = if (':' in raw.substringBefore('/')) raw else "$raw:3000"
                return "ws://$withPort/ws/phone"
            }
        }
    }

    /** Normalize stored laptop/tunnel address from QR or manual input. */
    fun normalizeHost(input: String): String {
        val raw = input.trim().trimEnd('/')
        if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
        return raw.removePrefix("ws://").removePrefix("wss://").removeSuffix("/ws/phone")
    }
}
