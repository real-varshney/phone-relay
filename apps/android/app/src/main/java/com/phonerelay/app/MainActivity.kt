package com.phonerelay.app

import android.Manifest
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.phonerelay.app.ui.RelayScreen
import com.phonerelay.app.ui.RelayTheme

class MainActivity : ComponentActivity() {
    private val askNotifications = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    private val askCamera = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) launchQrScanner()
        else Toast.makeText(this, "Camera permission is needed to scan the laptop QR.", Toast.LENGTH_LONG).show()
    }

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents.isNullOrBlank()) return@registerForActivityResult
        applyPairingText(result.contents)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        requestNotificationPermissionIfNeeded()
        loadSavedPairing()
        applyDeepLink(intent?.data)
        refreshIp()

        val prefs = getSharedPreferences(RelayService.PREFS, MODE_PRIVATE)
        var savedHost = prefs.getString(RelayService.KEY_HOST, "").orEmpty()
        savedHost = RelayEndpoints.normalizeHost(savedHost)
        if (savedHost != prefs.getString(RelayService.KEY_HOST, "")) {
            prefs.edit().putString(RelayService.KEY_HOST, savedHost).apply()
        }
        val savedCode = prefs.getString(RelayService.KEY_CODE, "").orEmpty()

        setContent {
            RelayTheme {
                RelayScreen(
                    initialHost = savedHost,
                    initialCode = PairingParser.formatCode(savedCode),
                    onScanQr = { startQrScan() },
                    onStart = { host, code -> connect(host, code) },
                    onStop = { RelayService.stop(this) },
                )
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyDeepLink(intent.data)
    }

    private fun startQrScan() {
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) launchQrScanner()
        else askCamera.launch(Manifest.permission.CAMERA)
    }

    private fun launchQrScanner() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            setPrompt("Point at the QR on your laptop screen")
            setBeepEnabled(true)
            setBarcodeImageEnabled(false)
            setOrientationLocked(false)
            captureActivity = PortraitCaptureActivity::class.java
        }
        scanLauncher.launch(options)
    }

    private fun applyPairingText(raw: String) {
        val pairing = PairingParser.parse(raw)
        if (pairing == null) {
            Toast.makeText(this, "Not a Phone Relay QR. Open the laptop dashboard and scan that code.", Toast.LENGTH_LONG).show()
            return
        }
        val resolvedHost = pairing.host
        savePairing(resolvedHost, pairing.code)
        RelayState.update {
            it.copy(
                laptopHost = resolvedHost,
                pairingCode = PairingParser.formatCode(pairing.code),
                message = "Scanned — connecting…",
            )
        }
        Toast.makeText(this, "QR scanned. Connecting…", Toast.LENGTH_SHORT).show()
        connect(resolvedHost, pairing.code)
    }

    private fun connect(host: String, code: String) {
        val cleanHost = RelayEndpoints.normalizeHost(host)
        val cleanCode = code.replace(Regex("\\D"), "")
        if (cleanHost.isBlank() || cleanCode.length != 6) {
            Toast.makeText(this, "Enter laptop address and 6-digit code.", Toast.LENGTH_SHORT).show()
            return
        }
        savePairing(cleanHost, cleanCode)
        RelayService.start(this)
    }

    private fun savePairing(host: String, code: String) {
        getSharedPreferences(RelayService.PREFS, MODE_PRIVATE).edit()
            .putString(RelayService.KEY_HOST, host)
            .putString(RelayService.KEY_CODE, code)
            .apply()
        RelayState.update { it.copy(laptopHost = host, pairingCode = PairingParser.formatCode(code)) }
    }

    private fun loadSavedPairing() {
        val prefs = getSharedPreferences(RelayService.PREFS, MODE_PRIVATE)
        val rawHost = prefs.getString(RelayService.KEY_HOST, "").orEmpty()
        val host = RelayEndpoints.normalizeHost(rawHost)
        if (host != rawHost) {
            prefs.edit().putString(RelayService.KEY_HOST, host).apply()
        }
        val code = prefs.getString(RelayService.KEY_CODE, "").orEmpty()
        RelayState.update { it.copy(laptopHost = host, pairingCode = PairingParser.formatCode(code)) }
    }

    private fun applyDeepLink(uri: Uri?) {
        if (uri == null) return
        applyPairingText(uri.toString())
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun refreshIp() {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val ip = NetworkInterfaces.wifiIpv4(cm) ?: NetworkInterfaces.anyLocalIPv4() ?: "—"
        RelayState.update { it.copy(phoneIp = ip) }
    }
}

/** Portrait QR scanner with readable prompt text. */
class PortraitCaptureActivity : com.journeyapps.barcodescanner.CaptureActivity()
