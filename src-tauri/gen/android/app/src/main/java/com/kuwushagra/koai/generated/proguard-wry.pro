# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class com.kuwushagra.koai.* {
  native <methods>;
}

-keep class com.kuwushagra.koai.WryActivity {
  public <init>(...);

  void setWebView(com.kuwushagra.koai.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class com.kuwushagra.koai.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class com.kuwushagra.koai.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class com.kuwushagra.koai.RustWebChromeClient,com.kuwushagra.koai.RustWebViewClient {
  public <init>(...);
}
