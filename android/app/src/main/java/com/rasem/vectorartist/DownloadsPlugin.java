package com.rasem.vectorartist;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.Base64;

@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String mime = call.getString(
            "mimeType",
            "application/octet-stream"
        );

        String data = call.getString("data");

        if (filename == null || data == null) {
            call.reject("بيانات الملف غير مكتملة");
            return;
        }

        try {
            Intent intent = new Intent(
                Intent.ACTION_CREATE_DOCUMENT
            );

            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, filename);

            startActivityForResult(
                call,
                intent,
                "saveResult"
            );

        } catch (Exception error) {
            call.reject(
                "تعذر فتح نافذة حفظ الملف: " + error.getMessage(),
                error
            );
        }
    }

    @ActivityCallback
    private void saveResult(
        PluginCall call,
        ActivityResult result
    ) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Intent intent = result.getData();

        if (intent == null || intent.getData() == null) {
            call.reject("لم يتم اختيار مكان الحفظ");
            return;
        }

        Uri uri = intent.getData();

        try {
            String base64 = call.getString("data");

            if (base64 == null) {
                throw new Exception("بيانات الملف مفقودة");
            }

            byte[] bytes = Base64.getDecoder().decode(base64);

            try (
                OutputStream output = getContext()
                    .getContentResolver()
                    .openOutputStream(uri, "w")
            ) {
                if (output == null) {
                    throw new Exception("تعذر فتح الملف للكتابة");
                }

                output.write(bytes);
                output.flush();
            }

            JSObject response = new JSObject();
            response.put("uri", uri.toString());
            response.put("filename", call.getString("filename"));
            response.put("saved", true);

            call.resolve(response);

        } catch (Exception error) {
            call.reject(
                "فشل حفظ الملف: " + error.getMessage(),
                error
            );
        }
    }
}
