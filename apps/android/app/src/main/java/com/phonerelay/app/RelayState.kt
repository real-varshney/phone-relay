package com.phonerelay.app

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

object RelayState {
    enum class Status { WAITING, CONNECTING, CONNECTED, ERROR }

    data class Snapshot(
        val status: Status = Status.WAITING,
        val message: String = "Waiting for connection",
        val laptopHost: String = "",
        val phoneIp: String = "—",
        val pairingCode: String = "",
        val requestCount: Int = 0,
        val lastUrl: String = "",
    )

    private val _snapshot = MutableStateFlow(Snapshot())
    val snapshot = _snapshot.asStateFlow()

    fun update(transform: (Snapshot) -> Snapshot) {
        _snapshot.value = transform(_snapshot.value)
    }
}
