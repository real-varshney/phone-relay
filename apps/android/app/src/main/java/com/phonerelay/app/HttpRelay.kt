package com.phonerelay.app

import android.util.Base64
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class HttpRelay(private val client: OkHttpClient) {
    fun execute(msg: JSONObject): JSONObject {
        val requestId = msg.optString("requestId")
        val started = System.currentTimeMillis()
        val url = msg.optString("url")
        val timeoutMs = msg.optLong("timeoutMs", 30_000L).coerceIn(5_000L, 120_000L)
        val policy = DestinationPolicy.inspect(url, allowPrivateLan = false)
        if (!policy.ok) {
            return error(requestId, policy.code, policy.message, started)
        }

        val method = msg.optString("method", "GET").uppercase()
        val headersJson = msg.optJSONObject("headers") ?: JSONObject()
        val bodyB64 = if (msg.isNull("bodyBase64")) null else msg.optString("bodyBase64")
        val bodyBytes = if (bodyB64.isNullOrEmpty()) null else Base64.decode(bodyB64, Base64.DEFAULT)
        if (bodyBytes != null && bodyBytes.size > MAX_BODY) {
            return error(requestId, "RESPONSE_TOO_LARGE", "Request exceeded the configured 50 MB limit.", started)
        }

        val mediaType = headersJson.optString("content-type", headersJson.optString("Content-Type"))
            .ifBlank { "application/octet-stream" }
            .toMediaTypeOrNull()
        val reqBody = if (method == "GET" || method == "HEAD") {
            null
        } else {
            (bodyBytes ?: ByteArray(0)).toRequestBody(mediaType)
        }

        val builder = Request.Builder().url(url).method(method, reqBody)
        val keys = headersJson.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (key.equals("host", true) || key.equals("content-length", true) ||
                key.equals("connection", true) || key.equals("transfer-encoding", true) ||
                key.equals("accept-encoding", true)
            ) continue
            builder.header(key, headersJson.getString(key))
        }
        // Avoid brotli/gzip bodies the relay stack cannot safely round-trip to Chrome.
        builder.header("Accept-Encoding", "identity")

        val timed = client.newBuilder()
            .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .build()

        return try {
            timed.newCall(builder.build()).execute().use { res ->
                val bytes = res.body?.bytes() ?: ByteArray(0)
                if (bytes.size > MAX_BODY) {
                    return error(requestId, "RESPONSE_TOO_LARGE", "Response exceeded the configured 50 MB limit.", started)
                }
                val outHeaders = JSONObject()
                val setCookies = res.headers("Set-Cookie")
                if (setCookies.isNotEmpty()) {
                    outHeaders.put("x-relay-set-cookie", JSONArray(setCookies).toString())
                }
                for (name in res.headers.names()) {
                    if (name.equals("content-encoding", true) ||
                        name.equals("transfer-encoding", true) ||
                        name.equals("content-length", true) ||
                        name.equals("set-cookie", true)
                    ) continue
                    outHeaders.put(name, res.header(name))
                }
                JSONObject()
                    .put("type", "relay_response")
                    .put("requestId", requestId)
                    .put("status", res.code)
                    .put("headers", outHeaders)
                    .put("bodyBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                    .put("error", JSONObject.NULL)
                    .put("durationMs", System.currentTimeMillis() - started)
            }
        } catch (e: Exception) {
            val code = if (e is java.net.SocketTimeoutException) "REQUEST_TIMEOUT" else "DESTINATION_UNREACHABLE"
            error(requestId, code, e.message ?: code, started)
        }
    }

    private fun error(requestId: String, code: String, message: String, started: Long): JSONObject {
        return JSONObject()
            .put("type", "relay_response")
            .put("requestId", requestId)
            .put("status", JSONObject.NULL)
            .put("headers", JSONObject())
            .put("bodyBase64", JSONObject.NULL)
            .put("error", JSONObject().put("code", code).put("message", message))
            .put("durationMs", System.currentTimeMillis() - started)
    }

    companion object {
        const val MAX_BODY = 50 * 1024 * 1024
    }
}
