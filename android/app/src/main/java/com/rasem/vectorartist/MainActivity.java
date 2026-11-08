package com.rasem.vectorartist;

import com.getcapacitor.BridgeActivity;
import com.rasem.vectorartist.DownloadsPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(DownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }}
