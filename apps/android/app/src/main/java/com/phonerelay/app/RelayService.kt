package com.phonerelay.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class RelayService : Service() {
    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        // No pingInterval — Dev Tunnel / mobile networks often drop WS ping/pong frames.
        .build()
    private val relayHttp = OkHttpClient.Builder()
        .cookieJar(RelayCookieJar())
        .protocols(listOf(Protocol.HTTP_1_1))
        .connectionPool(ConnectionPool(16, 5, TimeUnit.MINUTES))
        .retryOnConnectionFailure(true)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()
    private val relay = HttpRelay(relayHttp)
    private val workers = Executors.newCachedThreadPool()
    private val relaySlots = java.util.concurrent.Semaphore(12)
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private var socket: WebSocket? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var heartbeatTask: ScheduledFuture<*>? = null
    private var reconnectAttempt = 0
    private val userStopped = AtomicBoolean(false)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "phonerelay:relay").apply {
            acquire(6 * 60 * 60 * 1000L)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            userStopped.set(true)
            stopSelf()
            return START_NOT_STICKY
        }
        userStopped.set(false)
        val notification = buildNotification("Connecting to laptop…")
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(1, notification)
        }
        connect()
        return START_STICKY
    }

    override fun onDestroy() {
        userStopped.set(true)
        stopHeartbeat()
        socket?.close(1000, "stop")
        socket = null
        scheduler.shutdownNow()
        wakeLock?.let { if (it.isHeld) it.release() }
        workers.shutdownNow()
        RelayState.update { it.copy(status = RelayState.Status.WAITING, message = "Waiting for connection") }
        super.onDestroy()
    }

    private fun stopHeartbeat() {
        heartbeatTask?.cancel(true)
        heartbeatTask = null
    }

    private fun startHeartbeat(webSocket: WebSocket) {
        stopHeartbeat()
        heartbeatTask = scheduler.scheduleAtFixedRate({
            try {
                webSocket.send(JSONObject().put("type", "heartbeat").toString())
            } catch (_: Exception) {
                /* socket may be closing */
            }
        }, 25, 25, TimeUnit.SECONDS)
    }

    private fun scheduleReconnect(wsUrl: String) {
        if (userStopped.get()) return
        reconnectAttempt = (reconnectAttempt + 1).coerceAtMost(8)
        val delaySec = minOf(30L, 2L shl (reconnectAttempt - 1))
        RelayState.update {
            it.copy(
                status = RelayState.Status.CONNECTING,
                message = "Reconnecting in ${delaySec}s…",
            )
        }
        workers.execute {
            try {
                Thread.sleep(delaySec * 1000)
            } catch (_: InterruptedException) {
                return@execute
            }
            if (!userStopped.get()) connect()
        }
    }

    private fun connect() {
        stopHeartbeat()
        socket?.close(1000, "reconnect")
        socket = null

        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        val host = RelayEndpoints.resolveHost(
            prefs.getString(KEY_HOST, "")?.trim().orEmpty(),
        )
        val code = prefs.getString(KEY_CODE, "")?.replace(Regex("\\D"), "").orEmpty()
        val token = prefs.getString(KEY_TOKEN, "")
        if (host.isBlank()) {
            RelayState.update { it.copy(status = RelayState.Status.ERROR, message = "Set the laptop address first.") }
            stopSelf()
            return
        }
        val wsUrl = RelayEndpoints.websocketUrl(host)
        RelayState.update {
            it.copy(status = RelayState.Status.CONNECTING, message = "Connecting to $wsUrl …", laptopHost = host)
        }
        val req = Request.Builder().url(wsUrl).build()
        socket = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                val hello = JSONObject().put("type", "hello").put("name", "Android Phone")
                if (!token.isNullOrBlank()) hello.put("token", token)
                else hello.put("code", code)
                webSocket.send(hello.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = JSONObject(text)
                when (msg.optString("type")) {
                    "hello_ok" -> {
                        reconnectAttempt = 0
                        prefs.edit()
                            .putString(KEY_TOKEN, msg.optString("sessionToken"))
                            .putString(KEY_DEVICE, msg.optString("deviceId"))
                            .apply()
                        startHeartbeat(webSocket)
                        RelayState.update {
                            it.copy(
                                status = RelayState.Status.CONNECTED,
                                message = "Connected",
                                laptopHost = host,
                            )
                        }
                        updateNotification("Connected to $host")
                    }
                    "relay_request" -> {
                        RelayState.update {
                            it.copy(
                                requestCount = it.requestCount + 1,
                                lastUrl = msg.optString("url"),
                            )
                        }
                        workers.execute {
                            relaySlots.acquire()
                            try {
                                val reply = relay.execute(msg)
                                webSocket.send(reply.toString())
                            } finally {
                                relaySlots.release()
                            }
                        }
                    }
                    "revoke" -> {
                        prefs.edit().remove(KEY_TOKEN).apply()
                        RelayState.update { it.copy(status = RelayState.Status.WAITING, message = "Disconnected by laptop") }
                        stopSelf()
                    }
                    "error" -> {
                        RelayState.update {
                            it.copy(
                                status = RelayState.Status.ERROR,
                                message = msg.optString("message", "AUTHENTICATION_FAILED"),
                            )
                        }
                    }
                    "heartbeat_ok" -> { }
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                stopHeartbeat()
                val detail = t.message ?: "Phone could not reach the laptop."
                val isPing = detail.contains("ping", ignoreCase = true) ||
                    detail.contains("pong", ignoreCase = true)
                if (userStopped.get()) return
                if (isPing) {
                    RelayState.update {
                        it.copy(status = RelayState.Status.CONNECTING, message = "Connection dropped — reconnecting…")
                    }
                    scheduleReconnect(wsUrl)
                    return
                }
                RelayState.update {
                    it.copy(
                        status = RelayState.Status.ERROR,
                        message = "$detail ($wsUrl)",
                    )
                }
                scheduleReconnect(wsUrl)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                stopHeartbeat()
                if (userStopped.get()) {
                    RelayState.update { it.copy(status = RelayState.Status.WAITING, message = "Waiting for connection") }
                    return
                }
                RelayState.update {
                    it.copy(status = RelayState.Status.CONNECTING, message = "Disconnected — reconnecting…")
                }
                scheduleReconnect(wsUrl)
            }
        })
    }

    private fun createChannel() {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Phone Relay", NotificationManager.IMPORTANCE_LOW),
        )
    }

    private fun buildNotification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, RelayService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return Notification.Builder(this, CHANNEL)
            .setContentTitle("Phone Relay")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build())
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(1, buildNotification(text))
    }

    companion object {
        const val CHANNEL = "relay"
        const val ACTION_STOP = "com.phonerelay.app.STOP"
        const val PREFS = "relay"
        const val KEY_HOST = "host"
        const val KEY_CODE = "code"
        const val KEY_TOKEN = "token"
        const val KEY_DEVICE = "device"

        fun start(ctx: Context) {
            val intent = Intent(ctx, RelayService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
        }

        fun stop(ctx: Context) {
            ctx.startService(Intent(ctx, RelayService::class.java).setAction(ACTION_STOP))
        }
    }
}
