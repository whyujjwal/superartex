package superartex;

import burp.IBurpExtender;
import burp.IBurpExtenderCallbacks;
import burp.IExtensionHelpers;
import burp.IHttpRequestResponse;
import burp.IInterceptedProxyMessage;
import burp.IProxyListener;
import burp.IRequestInfo;
import burp.IResponseInfo;
import burp.ITab;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JPasswordField;
import javax.swing.JTextField;
import java.awt.BorderLayout;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * SuperArtex Burp Suite extension: pushes proxy traffic into a SuperArtex
 * instance through the same /api/traffic/ingest endpoint the browser
 * extension uses, so Burp-driven manual testing becomes agent-visible
 * evidence exactly like captured browsing.
 *
 * Load: Extensions → Add → Java → SuperArtexBurp.jar (see extension-burp/README.md).
 */
public class SuperArtexBurp implements IBurpExtender, IProxyListener, ITab {

    private static final int FLUSH_AT = 10;              // entries per batch (matches the browser extension)
    private static final int MAX_BODY = 256 * 1024;      // matches the server-side ingest cap
    private static final String[] SKIP_MIME = {"image/", "font/", "audio/", "video/", "application/octet-stream"};

    private IBurpExtenderCallbacks callbacks;
    private IExtensionHelpers helpers;

    private final List<Map<String, Object>> queue = new ArrayList<>();
    private final ExecutorService sender = Executors.newSingleThreadExecutor();
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicLong ingested = new AtomicLong();
    private final AtomicLong failed = new AtomicLong();
    private volatile String lastError = "";

    private JTextField urlField;
    private JPasswordField tokenField;
    private JLabel statusLabel;

    @Override
    public void registerExtenderCallbacks(IBurpExtenderCallbacks cb) {
        this.callbacks = cb;
        this.helpers = cb.getHelpers();
        cb.setExtensionName("SuperArtex Traffic Capture");
        cb.registerProxyListener(this);
        cb.addSuiteTab(this);
        // Config persistence via the extension settings store.
        String savedUrl = cb.loadExtensionSetting("superartex.url");
        String savedToken = cb.loadExtensionSetting("superartex.token");
        urlField = new JTextField(savedUrl == null ? "" : savedUrl, 32);
        tokenField = new JPasswordField(savedToken == null ? "" : savedToken, 32);
        cb.printOutput("SuperArtex Traffic Capture loaded. Configure the URL and token, then press Start.");
    }

    // ---- proxy capture ----

    @Override
    public void processProxyMessage(boolean messageIsRequest, IInterceptedProxyMessage message) {
        if (messageIsRequest || !running.get()) {
            return; // wait for the response half, when both bodies exist
        }
        try {
            IHttpRequestResponse info = message.getMessageInfo();
            if (info.getRequest() == null || info.getResponse() == null) {
                return;
            }
            IRequestInfo req = helpers.analyzeRequest(info);
            IResponseInfo resp = helpers.analyzeResponse(info.getResponse());

            Map<String, String> respHeaders = headerMap(resp.getHeaders());
            String contentType = respHeaders.getOrDefault("content-type", "");
            if (skipBody(contentType)) {
                return;
            }

            byte[] reqBytes = info.getRequest();
            byte[] respBytes = info.getResponse();
            String requestBody = bodyToString(reqBytes, req.getBodyOffset());
            String responseBody = bodyToString(respBytes, resp.getBodyOffset());

            Map<String, Object> exchange = new LinkedHashMap<>();
            exchange.put("method", req.getMethod());
            exchange.put("url", req.getUrl() == null ? "" : req.getUrl().toString());
            exchange.put("status", resp.getStatusCode());
            exchange.put("requestHeaders", headerMap(req.getHeaders()));
            exchange.put("requestBody", requestBody);
            exchange.put("responseHeaders", respHeaders);
            exchange.put("responseBody", responseBody);
            if (exchange.get("url").equals("")) {
                return;
            }

            synchronized (queue) {
                queue.add(exchange);
                if (queue.size() >= FLUSH_AT) {
                    flushLocked();
                }
            }
        } catch (Exception e) {
            lastError = "capture error: " + e.getMessage();
            callbacks.printError("SuperArtex capture error: " + e);
        }
    }

    private static boolean skipBody(String mime) {
        String mt = mime == null ? "" : mime.toLowerCase();
        for (String prefix : SKIP_MIME) {
            if (mt.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private static Map<String, String> headerMap(List<String> lines) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String line : lines) {
            int idx = line.indexOf(':');
            if (idx <= 0) {
                continue; // request/status line
            }
            String name = line.substring(0, idx).trim().toLowerCase();
            String value = line.substring(idx + 1).trim();
            out.put(name, value);
        }
        return out;
    }

    private String bodyToString(byte[] message, int offset) {
        if (message == null || offset < 0 || offset >= message.length) {
            return "";
        }
        String body = new String(message, offset, message.length - offset, StandardCharsets.UTF_8);
        if (body.length() > MAX_BODY) {
            return body.substring(0, MAX_BODY) + "\n... [truncated by burp extension]";
        }
        return body;
    }

    // ---- batching and upload ----

    private void flushLocked() {
        if (queue.isEmpty()) {
            return;
        }
        final List<Map<String, Object>> batch = new ArrayList<>(queue);
        queue.clear();
        final String base = urlField.getText().trim().replaceAll("/+$", "");
        final String token = new String(tokenField.getPassword()).trim();
        sender.submit(() -> sendBatch(base, token, batch));
    }

    private void sendBatch(String base, String token, List<Map<String, Object>> batch) {
        if (base.isEmpty() || token.isEmpty()) {
            lastError = "Set the SuperArtex URL and token first.";
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("exchanges", batch);
            byte[] body = toJson(payload).getBytes(StandardCharsets.UTF_8);

            HttpURLConnection conn = (HttpURLConnection) new URL(base + "/api/traffic/ingest").openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
            }
            int code = conn.getResponseCode();
            String respBody = readAll(code < 400 ? conn.getInputStream() : conn.getErrorStream());
            if (code == 200) {
                ingested.addAndGet(batch.size());
                lastError = "";
            } else {
                failed.addAndGet(batch.size());
                lastError = "ingest returned " + code + ": " + respBody;
                callbacks.printError("SuperArtex ingest failed: " + lastError);
            }
        } catch (Exception e) {
            failed.addAndGet(batch.size());
            lastError = "ingest error: " + e.getMessage();
            callbacks.printError("SuperArtex ingest error: " + e);
        }
    }

    private static String readAll(InputStream in) throws Exception {
        if (in == null) {
            return "";
        }
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int n;
        while ((n = in.read(chunk)) > 0) {
            buf.write(chunk, 0, n);
        }
        return buf.toString("UTF-8");
    }

    // ---- tiny JSON writer (no external dependencies) ----

    private static String toJson(Object value) {
        StringBuilder sb = new StringBuilder();
        writeJson(value, sb);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void writeJson(Object value, StringBuilder sb) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof String) {
            writeString((String) value, sb);
        } else if (value instanceof Number || value instanceof Boolean) {
            sb.append(value);
        } else if (value instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) value).entrySet()) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                writeString(e.getKey(), sb);
                sb.append(':');
                writeJson(e.getValue(), sb);
            }
            sb.append('}');
        } else if (value instanceof List) {
            sb.append('[');
            boolean first = true;
            for (Object item : (List<?>) value) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                writeJson(item, sb);
            }
            sb.append(']');
        } else {
            writeString(String.valueOf(value), sb);
        }
    }

    private static void writeString(String s, StringBuilder sb) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }

    // ---- UI ----

    @Override
    public String getTabCaption() {
        return "SuperArtex";
    }

    @Override
    public java.awt.Component getUiComponent() {
        if (urlField == null) {
            urlField = new JTextField(32);
        }
        if (tokenField == null) {
            tokenField = new JPasswordField(32);
        }
        JPanel panel = new JPanel(new GridBagLayout());
        panel.setBorder(BorderFactory.createEmptyBorder(12, 12, 12, 12));
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(4, 4, 4, 4);
        gbc.anchor = GridBagConstraints.WEST;
        gbc.fill = GridBagConstraints.HORIZONTAL;

        gbc.gridx = 0;
        gbc.gridy = 0;
        panel.add(new JLabel("SuperArtex URL:"), gbc);
        gbc.gridx = 1;
        panel.add(urlField, gbc);

        gbc.gridx = 0;
        gbc.gridy = 1;
        panel.add(new JLabel("API token:"), gbc);
        gbc.gridx = 1;
        panel.add(tokenField, gbc);

        JButton start = new JButton("Start");
        JButton stop = new JButton("Stop");
        gbc.gridx = 0;
        gbc.gridy = 2;
        gbc.fill = GridBagConstraints.NONE;
        JPanel buttons = new JPanel();
        buttons.add(start);
        buttons.add(stop);
        panel.add(buttons, gbc);

        statusLabel = new JLabel("Idle.");
        gbc.gridx = 1;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        panel.add(statusLabel, gbc);

        start.addActionListener(e -> {
            callbacks.saveExtensionSetting("superartex.url", urlField.getText().trim());
            callbacks.saveExtensionSetting("superartex.token", new String(tokenField.getPassword()).trim());
            running.set(true);
            lastError = "";
            updateStatus("Capturing proxy traffic.");
        });
        stop.addActionListener(e -> {
            running.set(false);
            synchronized (queue) {
                flushLocked();
            }
            updateStatus("Stopped; queued entries sent.");
        });

        javax.swing.Timer timer = new javax.swing.Timer(2000, e -> updateStatus(null));
        timer.start();
        return panel;
    }

    private void updateStatus(String message) {
        if (statusLabel == null) {
            return;
        }
        if (message != null) {
            statusLabel.setText(message);
            return;
        }
        String state = running.get() ? "Capturing" : "Idle";
        String err = lastError.isEmpty() ? "" : " | last error: " + lastError;
        statusLabel.setText(state + " — sent " + ingested.get() + ", failed " + failed.get() + err);
    }
}
