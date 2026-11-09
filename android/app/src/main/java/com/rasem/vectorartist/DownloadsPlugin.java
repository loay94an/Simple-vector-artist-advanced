package com.rasem.vectorartist;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {
    private OutputStream activeOutput;
    private String activeSessionId;
    private String activeFilename;
    private long activeBytesWritten = 0;

    @PluginMethod
    public void beginSave(PluginCall call) {
        String filename = call.getString("filename");
        String mime = call.getString("mimeType", "application/octet-stream");
        if (filename == null || filename.trim().isEmpty()) {
            call.reject("اسم الملف غير صالح");
            return;
        }
        if (mime != null && mime.contains(";")) mime = mime.substring(0, mime.indexOf(';')).trim();
        if (mime == null || mime.trim().isEmpty()) mime = "application/octet-stream";

        try {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(call, intent, "beginSaveResult");
        } catch (Exception error) {
            call.reject("تعذر فتح نافذة حفظ الملف: " + error.getMessage(), error);
        }
    }

    @ActivityCallback
    private void beginSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (uri == null) {
            call.reject("لم يتم اختيار موقع صالح لحفظ الملف");
            return;
        }

        try {
            OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w");
            if (output == null) throw new IOException("تعذر فتح الملف للكتابة");
            closeActiveOutput();
            activeOutput = output;
            activeSessionId = UUID.randomUUID().toString();
            activeFilename = call.getString("filename");
            activeBytesWritten = 0;

            JSObject response = new JSObject();
            response.put("sessionId", activeSessionId);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("تعذر بدء كتابة الملف: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public synchronized void writeChunk(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String encoded = call.getString("data");
        if (!isActive(sessionId) || encoded == null) {
            call.reject("جلسة الحفظ غير صالحة أو انتهت");
            return;
        }
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            activeOutput.write(bytes);
            activeBytesWritten += bytes.length;
            JSObject response = new JSObject();
            response.put("written", bytes.length);
            response.put("totalBytes", activeBytesWritten);
            call.resolve(response);
        } catch (Exception error) {
            closeActiveOutput();
            call.reject("فشلت كتابة جزء من الملف: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public synchronized void finishSave(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (!isActive(sessionId)) {
            call.reject("جلسة الحفظ غير صالحة أو انتهت");
            return;
        }
        try {
            activeOutput.flush();
            activeOutput.close();
            activeOutput = null;
            JSObject response = new JSObject();
            response.put("saved", true);
            response.put("filename", activeFilename);
            response.put("bytesWritten", activeBytesWritten);
            activeSessionId = null;
            activeFilename = null;
            activeBytesWritten = 0;
            call.resolve(response);
        } catch (Exception error) {
            closeActiveOutput();
            call.reject("تعذر إكمال حفظ الملف: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public synchronized void cancelSave(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (isActive(sessionId)) closeActiveOutput();
        JSObject response = new JSObject();
        response.put("cancelled", true);
        call.resolve(response);
    }

    private boolean isActive(String sessionId) {
        return activeOutput != null && activeSessionId != null && activeSessionId.equals(sessionId);
    }

    private synchronized void closeActiveOutput() {
        if (activeOutput != null) {
            try { activeOutput.close(); } catch (IOException ignored) {}
        }
        activeOutput = null;
        activeSessionId = null;
        activeFilename = null;
        activeBytesWritten = 0;
    }

    @Override
    protected void handleOnDestroy() {
        closeActiveOutput();
        super.handleOnDestroy();
    }
}