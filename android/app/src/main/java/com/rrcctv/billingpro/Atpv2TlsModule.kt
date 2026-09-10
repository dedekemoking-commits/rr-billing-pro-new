package com.rrcctv.billingpro

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.KeyFactory
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.PKCS8EncodedKeySpec
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class Atpv2TlsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val connections = ConcurrentHashMap<Int, SSLSocket>()
    private var nextId = 1

    override fun getName(): String = "Atpv2Tls"

    @ReactMethod
    fun connect(host: String, port: Int, certPem: String, keyPem: String, timeoutMs: Int, promise: Promise) {
        Thread {
            val id = nextId++
            try {
                Log.d(TAG, "connect $host:$port timeout=$timeoutMs id=$id")
                val socket = doConnectTls(host, port, certPem, keyPem, timeoutMs)
                connections[id] = socket
                Log.d(TAG, "connect OK id=$id")
                val result = Arguments.createMap()
                result.putInt("id", id)
                result.putBoolean("success", true)
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "connect FAIL: ${e.message}")
                val result = Arguments.createMap()
                result.putInt("id", -1)
                result.putBoolean("success", false)
                result.putString("error", e.message ?: "Unknown error")
                promise.resolve(result)
            }
        }.start()
    }

    @ReactMethod
    fun send(id: Int, data: ReadableArray, promise: Promise) {
        Thread {
            val socket = connections[id]
            if (socket == null) {
                promise.resolve(errorResult("Connection $id not found"))
                return@Thread
            }
            try {
                val bytes = toByteArray(data)
                Log.d(TAG, "send id=$id len=${bytes.size}")
                val os = socket.getOutputStream()
                os.write(bytes)
                os.flush()
                promise.resolve(okResult())
            } catch (e: Exception) {
                Log.e(TAG, "send FAIL: ${e.message}")
                promise.resolve(errorResult(e.message ?: "Write error"))
            }
        }.start()
    }

    @ReactMethod
    fun read(id: Int, timeoutMs: Int, promise: Promise) {
        Thread {
            val socket = connections[id]
            if (socket == null) {
                promise.resolve(errorResult("Connection $id not found"))
                return@Thread
            }
            try {
                Log.d(TAG, "read id=$id timeout=$timeoutMs")
                socket.soTimeout = timeoutMs
                val buffer = ByteArray(65536)
                val n = socket.getInputStream().read(buffer)
                if (n == -1) {
                    promise.resolve(errorResult("Connection closed"))
                } else {
                    Log.d(TAG, "read OK id=$id bytes=$n")
                    promise.resolve(successResult(buffer.copyOf(n)))
                }
            } catch (e: java.net.SocketTimeoutException) {
                Log.d(TAG, "read TIMEOUT id=$id")
                promise.resolve(errorResult("Read timeout"))
            } catch (e: Exception) {
                Log.e(TAG, "read FAIL: ${e.message}")
                promise.resolve(errorResult(e.message ?: "Read error"))
            }
        }.start()
    }

    @ReactMethod
    fun sendAndRead(id: Int, data: ReadableArray, timeoutMs: Int, promise: Promise) {
        Thread {
            val socket = connections[id]
            if (socket == null) {
                promise.resolve(errorResult("Connection $id not found"))
                return@Thread
            }
            try {
                val bytes = toByteArray(data)
                Log.d(TAG, "sendAndRead id=$id sendLen=${bytes.size} timeout=$timeoutMs")
                val os = socket.getOutputStream()
                os.write(bytes)
                os.flush()
                Log.d(TAG, "sendAndRead write done id=$id")

                socket.soTimeout = timeoutMs
                val buffer = ByteArray(65536)
                val n = socket.getInputStream().read(buffer)
                if (n == -1) {
                    promise.resolve(errorResult("Connection closed"))
                } else {
                    Log.d(TAG, "sendAndRead OK id=$id bytes=$n")
                    promise.resolve(successResult(buffer.copyOf(n)))
                }
            } catch (e: java.net.SocketTimeoutException) {
                Log.d(TAG, "sendAndRead TIMEOUT id=$id")
                promise.resolve(errorResult("Response timeout"))
            } catch (e: Exception) {
                Log.e(TAG, "sendAndRead FAIL: ${e.message}")
                promise.resolve(errorResult(e.message ?: "Send/read error"))
            }
        }.start()
    }

    /**
     * Send data and read a complete length-prefixed protobuf message.
     * Uses soTimeout on the socket (NOT Thread.interrupt) to avoid closing SSL.
     * Reads varint length first, then accumulates the message body.
     */
    @ReactMethod
    fun sendAndReadAll(id: Int, data: ReadableArray, timeoutMs: Int, promise: Promise) {
        Thread {
            val socket = connections[id]
            if (socket == null) {
                promise.resolve(errorResult("Connection $id not found"))
                return@Thread
            }
            try {
                val bytes = toByteArray(data)
                Log.d(TAG, "sendAndReadAll id=$id sendLen=${bytes.size} timeout=$timeoutMs")
                val os = socket.getOutputStream()
                os.write(bytes)
                os.flush()
                Log.d(TAG, "sendAndReadAll write done id=$id")

                socket.soTimeout = timeoutMs
                val inputStream = socket.getInputStream()
                val baos = ByteArrayOutputStream()
                val singleBuf = ByteArray(1)

                // Step 1: Read varint length prefix
                var msgLen = 0
                var shift = 0
                for (i in 0..4) {
                    val n = inputStream.read(singleBuf)
                    if (n == -1) {
                        promise.resolve(errorResult("Connection closed during varint"))
                        return@Thread
                    }
                    baos.write(singleBuf[0].toInt() and 0xFF)
                    val b = singleBuf[0].toInt() and 0xFF
                    msgLen = msgLen or ((b and 0x7F) shl shift)
                    shift += 7
                    if ((b and 0x80) == 0) break
                }
                Log.d(TAG, "sendAndReadAll msgLen=$msgLen id=$id")

                if (msgLen <= 0 || msgLen > 1048576) {
                    promise.resolve(errorResult("Invalid message length: $msgLen"))
                    return@Thread
                }

                // Step 2: Read exactly msgLen bytes of message body
                var remaining = msgLen
                while (remaining > 0) {
                    val n = inputStream.read(singleBuf)
                    if (n == -1) {
                        promise.resolve(errorResult("Connection closed, got ${msgLen - remaining}/$msgLen"))
                        return@Thread
                    }
                    baos.write(singleBuf[0].toInt() and 0xFF)
                    remaining--
                }

                // Return varint + message body (matching protobuf wire format)
                val result = baos.toByteArray()
                Log.d(TAG, "sendAndReadAll OK id=$id total=${result.size}")
                promise.resolve(successResult(result))
            } catch (e: java.net.SocketTimeoutException) {
                Log.d(TAG, "sendAndReadAll TIMEOUT id=$id")
                promise.resolve(errorResult("Response timeout"))
            } catch (e: Exception) {
                Log.e(TAG, "sendAndReadAll FAIL: ${e.message}")
                promise.resolve(errorResult(e.message ?: "Send/read error"))
            }
        }.start()
    }

    @ReactMethod
    fun getServerCert(id: Int, promise: Promise) {
        Thread {
            val socket = connections[id]
            if (socket == null) {
                promise.resolve(errorResult("Connection $id not found"))
                return@Thread
            }
            try {
                val peerCerts = socket.session.peerCertificates
                if (peerCerts.isNotEmpty()) {
                    val cert = peerCerts[0] as X509Certificate
                    val rsaKey = cert.publicKey as java.security.interfaces.RSAPublicKey
                    Log.d(TAG, "getServerCert OK id=$id keySize=${rsaKey.modulus.bitLength()}")
                    val result = Arguments.createMap()
                    result.putBoolean("success", true)
                    result.putString("modulus", rsaKey.modulus.toString(16))
                    result.putString("exponent", rsaKey.publicExponent.toString(16))
                    result.putString("derBase64", Base64.getEncoder().encodeToString(cert.encoded))
                    promise.resolve(result)
                } else {
                    promise.resolve(errorResult("No peer certificates"))
                }
            } catch (e: Exception) {
                Log.e(TAG, "getServerCert FAIL: ${e.message}")
                promise.resolve(errorResult(e.message ?: "Cert extract error"))
            }
        }.start()
    }

    @ReactMethod
    fun disconnect(id: Int, promise: Promise) {
        val socket = connections.remove(id)
        try { socket?.close() } catch (_: Exception) {}
        Log.d(TAG, "disconnect id=$id")
        promise.resolve(okResult())
    }

    @ReactMethod
    fun isConnected(id: Int, promise: Promise) {
        val socket = connections[id]
        val connected = socket?.let { !it.isClosed && it.isConnected } ?: false
        promise.resolve(connected)
    }

    // ─── Helpers ────────────────────────────────────────────────

    private fun toByteArray(data: ReadableArray): ByteArray {
        val bytes = ByteArray(data.size())
        for (i in 0 until data.size()) {
            bytes[i] = data.getInt(i).toByte()
        }
        return bytes
    }

    private fun okResult(): WritableMap {
        val result = Arguments.createMap()
        result.putBoolean("success", true)
        return result
    }

    private fun successResult(data: ByteArray): WritableMap {
        val result = Arguments.createMap()
        result.putBoolean("success", true)
        val arr = Arguments.createArray()
        for (b in data) arr.pushInt(b.toInt() and 0xFF)
        result.putArray("data", arr)
        return result
    }

    private fun errorResult(msg: String): WritableMap {
        val result = Arguments.createMap()
        result.putBoolean("success", false)
        result.putString("error", msg)
        result.putArray("data", Arguments.createArray())
        return result
    }

    // ─── TLS connect ───────────────────────────────────────────

    private fun doConnectTls(host: String, port: Int, certPem: String, keyPem: String, timeoutMs: Int): SSLSocket {
        val certFactory = CertificateFactory.getInstance("X.509")
        val certClean = certPem
            .replace("-----BEGIN CERTIFICATE-----", "")
            .replace("-----END CERTIFICATE-----", "")
            .replace("\\s".toRegex(), "")
        val certBytes = Base64.getDecoder().decode(certClean)
        val clientCert = certFactory.generateCertificate(ByteArrayInputStream(certBytes)) as X509Certificate

        val keyClean = keyPem
            .replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replace("-----BEGIN RSA PRIVATE KEY-----", "")
            .replace("-----END RSA PRIVATE KEY-----", "")
            .replace("\\s".toRegex(), "")
        val keyBytes = Base64.getDecoder().decode(keyClean)
        val keySpec = PKCS8EncodedKeySpec(keyBytes)
        val keyFactory = KeyFactory.getInstance("RSA")
        val privateKey = keyFactory.generatePrivate(keySpec)

        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType())
        keyStore.load(null, null)
        keyStore.setKeyEntry("client", privateKey, charArrayOf(), arrayOf(clientCert))

        val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
        kmf.init(keyStore, charArrayOf())

        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        })

        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(kmf.keyManagers, trustAllCerts, java.security.SecureRandom())

        val factory = sslContext.socketFactory as SSLSocketFactory
        val socket = factory.createSocket() as SSLSocket

        val protocols = mutableListOf<String>()
        for (p in socket.supportedProtocols) {
            if (p.startsWith("TLS")) protocols.add(p)
        }
        socket.enabledProtocols = protocols.toTypedArray()

        socket.connect(java.net.InetSocketAddress(host, port), timeoutMs)
        socket.startHandshake()

        Log.d(TAG, "doConnectTls OK $host:$port protocol=${socket.session.protocol}")
        return socket
    }

    companion object {
        private const val TAG = "Atpv2Tls"
    }
}
