package com.phonerelay.app

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import java.util.concurrent.ConcurrentHashMap

/** In-memory cookie store so CDN auth cookies (hdntl) from manifest carry to segments. */
class RelayCookieJar : CookieJar {
    private val store = ConcurrentHashMap<String, MutableList<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val key = url.host
        val bucket = store.getOrPut(key) { mutableListOf() }
        synchronized(bucket) {
            for (incoming in cookies) {
                bucket.removeAll { it.name == incoming.name && it.matches(url) }
                if (!incoming.persistent || incoming.expiresAt > System.currentTimeMillis()) {
                    bucket.add(incoming)
                }
            }
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val bucket = store[url.host] ?: return emptyList()
        synchronized(bucket) {
            bucket.removeAll { it.expiresAt <= System.currentTimeMillis() }
            return bucket.filter { it.matches(url) }
        }
    }
}
