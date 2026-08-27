package com.phonerelay.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phonerelay.app.PairingParser
import com.phonerelay.app.RelayConfig
import com.phonerelay.app.RelayState

@Composable
fun RelayScreen(
    initialHost: String,
    initialCode: String,
    onScanQr: () -> Unit,
    onStart: (host: String, code: String) -> Unit,
    onStop: () -> Unit,
) {
    val snap by RelayState.snapshot.collectAsState()
    var host by rememberSaveable { mutableStateOf(initialHost) }
    var code by rememberSaveable { mutableStateOf(initialCode) }
    var showManual by rememberSaveable { mutableStateOf(initialHost.isBlank() && initialCode.isBlank()) }

    LaunchedEffect(snap.laptopHost, snap.pairingCode) {
        if (snap.laptopHost.isNotBlank()) host = snap.laptopHost
        if (snap.pairingCode.isNotBlank()) code = snap.pairingCode
    }

    val connected = snap.status == RelayState.Status.CONNECTED
    val connecting = snap.status == RelayState.Status.CONNECTING
    val busy = connected || connecting

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            "Phone Relay",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            "Pair once, then leave this app open. Your laptop sends web requests through this phone.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f),
        )

        StatusCard(snap.status, snap.message)

        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Your phone", fontWeight = FontWeight.SemiBold)
                Text("Wi‑Fi IP: ${snap.phoneIp}", style = MaterialTheme.typography.bodyLarge)
                if (snap.laptopHost.isNotBlank()) {
                    Text("Server: ${snap.laptopHost}", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "WebSocket: ${com.phonerelay.app.RelayEndpoints.websocketUrl(snap.laptopHost)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.65f),
                    )
                }
                if (connected) {
                    Text("Requests handled: ${snap.requestCount}", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        if (busy) {
            Button(
                onClick = onStop,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Disconnect", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
            if (snap.lastUrl.isNotBlank()) {
                Text(
                    "Last: ${snap.lastUrl}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                )
            }
        } else {
            Text(
                "Scan the QR on your laptop dashboard (shortcut/Start Phone Relay.bat).",
                fontWeight = FontWeight.Medium,
            )

            Button(
                onClick = onScanQr,
                modifier = Modifier.fillMaxWidth().height(64.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(28.dp))
                Spacer(Modifier.size(12.dp))
                Text("Scan laptop QR code", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = { showManual = !showManual },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text(if (showManual) "Hide manual entry" else "Enter code manually instead")
            }

            if (showManual) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Manual pairing", fontWeight = FontWeight.SemiBold)
                        OutlinedTextField(
                            value = host,
                            onValueChange = { host = it },
                            label = { Text("Laptop / tunnel URL") },
                            placeholder = { Text(RelayConfig.MANUAL_HOST_HINT) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = code,
                            onValueChange = { code = it.filter { ch -> ch.isDigit() || ch == '-' }.take(7) },
                            label = { Text("Pairing code") },
                            placeholder = { Text("482-913") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                    }
                }
            }

            val canConnect = host.isNotBlank() && code.replace(Regex("\\D"), "").length == 6
            Button(
                onClick = { onStart(host, code) },
                enabled = canConnect,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Connect to laptop", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }

            if (!canConnect && !showManual && host.isBlank()) {
                Text(
                    "Scan the QR on your laptop dashboard — that fills everything automatically.",
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.65f),
                )
            }
        }
    }
}

@Composable
private fun StatusCard(status: RelayState.Status, message: String) {
    val (dotColor, title) = when (status) {
        RelayState.Status.CONNECTED -> MaterialTheme.colorScheme.primary to "Connected"
        RelayState.Status.CONNECTING -> MaterialTheme.colorScheme.tertiary to "Connecting…"
        RelayState.Status.ERROR -> MaterialTheme.colorScheme.error to "Error"
        RelayState.Status.WAITING -> MaterialTheme.colorScheme.outline to "Not connected"
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier
                    .size(14.dp)
                    .clip(CircleShape)
                    .background(dotColor),
            )
            Column {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text(message, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
