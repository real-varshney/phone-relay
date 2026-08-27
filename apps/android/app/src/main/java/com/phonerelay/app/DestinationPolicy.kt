package com.phonerelay.app

import java.net.InetAddress

object DestinationPolicy {
    private val blockedNames = setOf(
        "localhost",
        "metadata.google.internal",
        "metadata.goog",
        "instance-data",
    )
    private val blockedSuffixes = listOf(".local", ".localhost", ".internal", ".lan")

    data class Result(val ok: Boolean, val code: String, val message: String)

    fun inspect(raw: String, allowPrivateLan: Boolean): Result {
        val url = try {
            java.net.URI(raw).toURL()
        } catch (_: Exception) {
            return Result(false, "DESTINATION_BLOCKED", "URL could not be parsed.")
        }
        if (url.protocol != "http" && url.protocol != "https") {
            return Result(false, "DESTINATION_BLOCKED", "Only http and https destinations are allowed.")
        }
        val host = url.host?.trim('.')?.lowercase() ?: return Result(
            false, "DESTINATION_BLOCKED", "That destination is not permitted by the relay security policy.",
        )
        if (host in blockedNames || blockedSuffixes.any { host.endsWith(it) }) {
            return Result(false, "DESTINATION_BLOCKED", "That destination is not permitted by the relay security policy.")
        }
        val addresses = try {
            InetAddress.getAllByName(host)
        } catch (_: Exception) {
            return Result(false, "DESTINATION_UNREACHABLE", "The hostname could not be resolved.")
        }
        if (addresses.isEmpty()) {
            return Result(false, "DESTINATION_UNREACHABLE", "The hostname could not be resolved.")
        }
        for (addr in addresses) {
            if (isBlockedAddress(addr, allowPrivateLan)) {
                return Result(false, "DESTINATION_BLOCKED", "That destination is not permitted by the relay security policy.")
            }
        }
        return Result(true, "", "")
    }

    private fun isBlockedAddress(addr: InetAddress, allowPrivateLan: Boolean): Boolean {
        if (addr.isLoopbackAddress || addr.isAnyLocalAddress) return true
        if (addr.isLinkLocalAddress) return true
        val host = addr.hostAddress ?: return true
        if (host == "169.254.169.254") return true
        if (addr.isSiteLocalAddress && !allowPrivateLan) return true
        return false
    }
}
