package to.moor.wdk_core_flutter

import android.content.Context
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject

/**
 * `to.moor/wdk` carries requests, `to.moor/wdk/events` streams notifications. JSON crosses
 * both as strings; only the Dart side decodes it.
 */
class WdkCoreFlutterPlugin : FlutterPlugin, MethodChannel.MethodCallHandler, EventChannel.StreamHandler {
    private lateinit var methods: MethodChannel
    private lateinit var events: EventChannel
    private lateinit var appContext: Context
    private var core: WdkCore? = null
    private var sink: EventChannel.EventSink? = null
    private val main = Handler(Looper.getMainLooper())

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        appContext = binding.applicationContext
        methods = MethodChannel(binding.binaryMessenger, "to.moor/wdk").also { it.setMethodCallHandler(this) }
        events = EventChannel(binding.binaryMessenger, "to.moor/wdk/events").also { it.setStreamHandler(this) }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        methods.setMethodCallHandler(null)
        events.setStreamHandler(null)
        core?.close(); core = null
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "start" -> {
                val c = core ?: WdkCore(appContext).also { core = it }
                // Listener before start: the first notification must have somewhere to go (rn-core#83).
                c.onNotification = { msg -> main.post { sink?.success(msg.toString()) } }
                c.start(reply(result))
            }
            "call" -> {
                val c = core ?: return result.error("NOT_STARTED", "call start() first", null)
                val method = call.argument<String>("method") ?: return result.error("BAD_ARGS", "method required", null)
                val params = call.argument<String>("params")?.let { JSONObject(it) } ?: JSONObject()
                c.call(method, params, reply(result))
            }
            "close" -> { core?.close(); core = null; result.success(null) }
            else -> result.notImplemented()
        }
    }

    private fun reply(result: MethodChannel.Result) = WdkCore.Callback { res, err ->
        main.post {
            when {
                err is WdkCore.RpcException -> result.error(err.code, err.message, err.data?.toString())
                err != null -> result.error("IPC", err.message ?: err.toString(), null)
                else -> result.success(res?.toString())
            }
        }
    }

    override fun onListen(arguments: Any?, eventSink: EventChannel.EventSink) { sink = eventSink }
    override fun onCancel(arguments: Any?) { sink = null }
}
