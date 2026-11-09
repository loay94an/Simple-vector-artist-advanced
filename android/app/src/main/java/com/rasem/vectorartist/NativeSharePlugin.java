package com.rasem.vectorartist;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "NativeShare")
public class NativeSharePlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String encodedData = call.getString("data");
        String title = call.getString("title", "مشاركة الرسم");

        if (filename == null || encodedData == null) {
            call.reject("بيانات الملف غير مكتملة للمشاركة");
            return;
        }

        File sharedFile = null;
        try {
            String safeName = new File(filename).getName()
                .replaceAll("[^\\p{L}\\p{N}._-]", "_");
            if (safeName.isEmpty()) safeName = "rasem-export";

            byte[] bytes = Base64.decode(encodedData, Base64.DEFAULT);
            File shareDirectory = new File(getContext().getCacheDir(), "shared");
            if (!shareDirectory.exists() && !shareDirectory.mkdirs()) {
                throw new IllegalStateException("تعذر إنشاء مجلد المشاركة");
            }

            sharedFile = new File(shareDirectory, safeName);
            try (FileOutputStream output = new FileOutputStream(sharedFile, false)) {
                output.write(bytes);
                output.flush();
            }

            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                sharedFile
            );

            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            String androidMimeType = mimeType.split(";")[0].trim();
            if (androidMimeType.isEmpty()) androidMimeType = "application/octet-stream";
            sendIntent.setType(androidMimeType);
            sendIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            sendIntent.setClipData(ClipData.newUri(
                getContext().getContentResolver(),
                safeName,
                contentUri
            ));
            sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(sendIntent, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);

            JSObject response = new JSObject();
            response.put("shared", true);
            response.put("filename", safeName);
            call.resolve(response);

        } catch (Exception error) {
            if (sharedFile != null && sharedFile.exists()) {
                // Keep the file only if Android has already accepted the chooser launch.
                // On an exception, remove the incomplete/unshareable temporary file.
                sharedFile.delete();
            }
            call.reject(
                "تعذر فتح قائمة مشاركة Android: " + error.getMessage(),
                error
            );
        }
    }
}
