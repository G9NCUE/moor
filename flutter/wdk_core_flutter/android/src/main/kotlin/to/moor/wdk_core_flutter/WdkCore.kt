package to.moor.wdk_core_flutter

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import org.json.JSONObject
import to.holepunch.bare.kit.IPC
import to.holepunch.bare.kit.Worklet
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * The WDK worklet over BareKit IPC, JSON-RPC 2.0, 4-byte big-endian length prefix.
 * Ported from wdk-core-kotlin plus the branch it lacks: a frame with no `id` goes to
 * [onNotification] instead of being dropped (finding 21).
 *
 * BareKit's IPC is bound to its creating looper, so all IPC runs on [ipcThread].
 */
class WdkCore(private val context: Context) {

    fun interface Callback { fun apply(result: JSONObject?, error: Throwable?) }

    class RpcException(val code: String, message: String, val data: JSONObject?) : Exception(message)

    private val worklet = Worklet(null)
    private var ipc: IPC? = null
    private val ipcThread = HandlerThread("WdkIPC").apply { start() }
    private val ipcHandler = Handler(ipcThread.looper)

    private val started = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val requestId = AtomicInteger(0)
    private val pending = ConcurrentHashMap<Int, Callback>()

    /** Set before [start] so the first notification is not lost. */
    @Volatile var onNotification: ((JSONObject) -> Unit)? = null

    // IPC thread only.
    private var readBuffer = ByteArray(0)

    fun start(cb: Callback) {
        if (started.getAndSet(true)) { cb.apply(JSONObject().put("status", "already-started"), null); return }
        ipcHandler.post {
            try {
                context.assets.open("wdk.bundle").use { worklet.start("/wdk.bundle", it, null) }
                ipc = IPC(worklet)
                readLoop()
                cb.apply(JSONObject().put("status", "started"), null)
            } catch (e: Throwable) {
                Log.e(TAG, "start failed", e)
                cb.apply(null, e)
            }
        }
    }

    fun call(method: String, params: JSONObject, cb: Callback) {
        if (closed.get()) { cb.apply(null, IllegalStateException("closed")); return }
        val id = requestId.incrementAndGet()
        val body = JSONObject()
            .put("jsonrpc", "2.0")
            .put("id", id)
            .put("method", method)
            .put("params", params)
            .toString()
            .toByteArray(Charsets.UTF_8)

        val frame = ByteBuffer.allocateDirect(4 + body.size).order(ByteOrder.BIG_ENDIAN)
        frame.putInt(body.size).put(body).flip()

        pending[id] = cb
        ipcHandler.post {
            val channel = ipc
            if (channel == null) { pending.remove(id)?.apply(null, IllegalStateException("IPC not open")); return@post }
            // The callback form writes the whole buffer; the int form may write less.
            channel.write(frame) { err ->
                if (err != null) pending.remove(id)?.apply(null, err)
            }
        }
    }

    fun close() {
        if (closed.getAndSet(true)) return
        ipcHandler.post {
            try { ipc?.close() } catch (_: Throwable) {}
            try { worklet.terminate() } catch (_: Throwable) {}
            val err = IllegalStateException("closed")
            for (id in pending.keys.toList()) pending.remove(id)?.apply(null, err)
            ipcThread.quitSafely()
        }
    }

    private fun readLoop() {
        val channel = ipc ?: return
        channel.read { data, err ->
            if (err != null) { Log.e(TAG, "ipc read", err); return@read }
            if (data == null || closed.get()) return@read
            val bytes = ByteArray(data.remaining()); data.get(bytes)
            readBuffer += bytes
            drainFrames()
            readLoop()
        }
    }

    private fun drainFrames() {
        while (readBuffer.size >= 4) {
            val len = ByteBuffer.wrap(readBuffer, 0, 4).order(ByteOrder.BIG_ENDIAN).int
            if (len !in 1..9_999_999) { Log.e(TAG, "bad frame length $len, dropping stream"); readBuffer = ByteArray(0); return }
            val end = 4 + len
            if (readBuffer.size < end) return
            val body = String(readBuffer, 4, len, Charsets.UTF_8)
            readBuffer = readBuffer.copyOfRange(end, readBuffer.size)
            dispatch(body)
        }
    }

    private fun dispatch(body: String) {
        val msg = try { JSONObject(body) } catch (e: Throwable) { Log.e(TAG, "unparseable frame: $body"); return }

        if (msg.has("id") && !msg.isNull("id")) {
            val id = msg.optInt("id", -1)
            val cb = pending.remove(id) ?: run { Log.w(TAG, "response for unknown id $id"); return }
            if (msg.has("error")) {
                val e = msg.getJSONObject("error")
                cb.apply(null, RpcException(e.optString("code", "UNKNOWN"), e.optString("message", "unknown error"), e.optJSONObject("data")))
            } else {
                cb.apply(msg.optJSONObject("result") ?: JSONObject().put("value", msg.opt("result")), null)
            }
            return
        }
        if (msg.has("method")) {
            onNotification?.invoke(msg) ?: Log.w(TAG, "notification with no listener: ${msg.optString("method")}")
            return
        }
        Log.w(TAG, "frame is neither response nor notification: $body")
    }

    private companion object { const val TAG = "WdkCore" }
}
