import Script from "next/script";

const runtimeDebugLoggerScript = `
(function () {
  if (window.__AXIOS_RUNTIME_DEBUG_INSTALLED__) return;
  window.__AXIOS_RUNTIME_DEBUG_INSTALLED__ = true;

  var MAX_EVENTS = 80;
  var SENSITIVE_KEY_PATTERN = /(authorization|token|secret|password|code|jwt|session|privy-access-token)/i;

  function safeStorageKeys(storage) {
    try {
      return Object.keys(storage || {});
    } catch (error) {
      return ["storage_unavailable"];
    }
  }

  function sanitize(value, depth) {
    if (depth > 4) return "[max_depth]";
    if (value == null) return value;
    if (typeof value === "string") {
      if (value.length > 600) return value.slice(0, 600) + "...[truncated]";
      if (/^(eyJ|0x[a-fA-F0-9]{80,})/.test(value)) return "[redacted_token_like_string]";
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function") return "[function]";
    if (Array.isArray(value)) return value.slice(0, 20).map(function (item) { return sanitize(item, depth + 1); });
    if (value instanceof Error) return normalizeError(value);
    if (typeof value === "object") {
      var output = {};
      Object.keys(value).slice(0, 40).forEach(function (key) {
        output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitize(value[key], depth + 1);
      });
      return output;
    }
    return String(value);
  }

  function normalizeError(error) {
    return {
      name: error && error.name,
      message: error && error.message,
      stack: error && error.stack,
      cause: error && error.cause ? sanitize(error.cause, 0) : undefined,
    };
  }

  function normalizeReason(reason) {
    if (reason instanceof Error) return normalizeError(reason);
    if (typeof reason === "object" && reason !== null) {
      return {
        name: reason.name,
        message: reason.message || String(reason),
        stack: reason.stack,
        value: sanitize(reason, 0),
      };
    }
    return { message: String(reason), value: sanitize(reason, 0) };
  }

  function looksLikePrivyRecovery(reason) {
    var text = [reason && reason.message, reason && reason.stack, reason && reason.name].filter(Boolean).join("\\n");
    return /recovery method not supported|embeddedWalletRecovery|EmbeddedWalletConnectingScreen|privy-provider|personal_sign|signMessage/i.test(text);
  }

  function snapshotContext() {
    return {
      url: location.href,
      origin: location.origin,
      pathname: location.pathname,
      search: location.search,
      referrer: document.referrer,
      visibilityState: document.visibilityState,
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      localStorageKeys: safeStorageKeys(window.localStorage),
      sessionStorageKeys: safeStorageKeys(window.sessionStorage),
      privy: sanitize(window.__AXIOS_PRIVY_STATE__ || null, 0),
    };
  }

  function pushDebugEvent(event) {
    var events = window.__AXIOS_DEBUG_EVENTS__ || [];
    events.push(event);
    window.__AXIOS_DEBUG_EVENTS__ = events.slice(-MAX_EVENTS);

    var label = "[axios-debug] " + event.kind + (event.privyRecoverySuspected ? " [privy-recovery]" : "");
    if (console.groupCollapsed) {
      console.groupCollapsed(label);
      console.log(event);
      console.groupEnd();
    } else {
      console.log(label, event);
    }
  }

  window.__AXIOS_DUMP_DEBUG__ = function () {
    var events = window.__AXIOS_DEBUG_EVENTS__ || [];
    console.log("[axios-debug] events", events);
    return events;
  };

  window.addEventListener("unhandledrejection", function (event) {
    var reason = normalizeReason(event.reason);
    pushDebugEvent({
      kind: "unhandledrejection",
      at: new Date().toISOString(),
      reason: reason,
      privyRecoverySuspected: looksLikePrivyRecovery(reason),
      context: snapshotContext(),
    });
  });

  window.addEventListener("error", function (event) {
    var reason = event.error ? normalizeError(event.error) : {
      message: event.message,
      stack: undefined,
    };
    pushDebugEvent({
      kind: "window_error",
      at: new Date().toISOString(),
      reason: reason,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      privyRecoverySuspected: looksLikePrivyRecovery(reason),
      context: snapshotContext(),
    });
  }, true);

  var originalFetch = window.fetch;
  window.fetch = function () {
    var input = arguments[0];
    var init = arguments[1] || {};
    var startedAt = Date.now();
    var url = typeof input === "string" ? input : input && input.url;
    var method = init.method || (input && input.method) || "GET";
    return originalFetch.apply(this, arguments).then(function (response) {
      if (!response.ok) {
        pushDebugEvent({
          kind: "fetch_http_error",
          at: new Date().toISOString(),
          request: { url: url, method: method },
          response: { status: response.status, statusText: response.statusText, type: response.type, redirected: response.redirected },
          durationMs: Date.now() - startedAt,
          context: snapshotContext(),
        });
      }
      return response;
    }, function (error) {
      var reason = normalizeReason(error);
      pushDebugEvent({
        kind: "fetch_rejected",
        at: new Date().toISOString(),
        request: { url: url, method: method },
        reason: reason,
        durationMs: Date.now() - startedAt,
        privyRecoverySuspected: looksLikePrivyRecovery(reason),
        context: snapshotContext(),
      });
      throw error;
    });
  };
})();
`;

export function RuntimeDebugLogger() {
  return (
    <Script
      id="axios-runtime-debug-logger"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: runtimeDebugLoggerScript }}
    />
  );
}
