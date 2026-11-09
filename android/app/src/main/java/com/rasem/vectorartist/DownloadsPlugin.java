package com.rasem.vectorartist;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String mime = call.getString("mimeType", "application/octet-stream");
        String data = call.getString("data");

        if (filename == null || filename.trim().isEmpty() || data == null) {
            call.reject("بيانات الملف أو اسمه غير مكتملة");
            return;
        }

        if (mime != null && mime.contains(";")) {
            mime = mime.substring(0, mime.indexOf(';')).trim();
        }
        if (mime == null || mime.trim().isEmpty()) {
            mime = "application/octet-stream";
        }

        try {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(call, intent, "saveResult");
        } catch (Exception error) {
            call.reject("تعذر فتح نافذة حفظ الملف: " + error.getMessage(), error);
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Intent resultIntent = result.getData();
        Uri uri = resultIntent == null ? null : resultIntent.getData();
        if (uri == null) {
            call.reject("لم يتم اختيار موقع صالح لحفظ الملف");
            return;
        }

        try {
            String encoded = call.getString("data");
            if (encoded == null || encoded.isEmpty()) throw new IllegalArgumentException("بيانات الملف مفقودة");

            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
                if (output == null) throw new IllegalStateException("تعذر فتح الملف للكتابة");
                output.write(bytes);
                output.flush();
            }

            JSObject response = new JSObject();
            response.put("saved", true);
            response.put("uri", uri.toString());
            response.put("filename", call.getString("filename"));
            response.put("bytesWritten", bytes.length);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("فشل حفظ الملف: " + error.getMessage(), error);
        }
    }
}
