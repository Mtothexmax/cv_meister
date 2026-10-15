# Keep rules for classes that native code reaches by name.
#
# R8 cannot see a JNI call. In src-tauri/src/gmail_share.rs the provider is
# reached like this:
#
#   env.call_static_method(&provider, "getUriForFile",
#       "(Landroid/content/Context;Ljava/lang/String;Ljava/io/File;)Landroid/net/Uri;", …)
#
# To the shrinker that method name is a string in the Rust binary — nothing in
# Java refers to it — so R8 deletes it. The release build still *compiles*, and
# the failure only appears on a device, as
#
#   NoSuchMethodError: no static method
#     "Landroidx/core/content/FileProvider;.getUriForFile(…)"
#
# which the app reports as „Android hat den Aufruf abgelehnt: java exception was
# thrown“. The debug build is unaffected (isMinifyEnabled = false), so this bites
# the release APK only — and the app's own `file_provider()` helper finds the
# *class* quite happily, which makes the error look unrelated to shrinking.
#
# Why the whole class and not just that one method: `FileProvider` is also a
# manifest component (`<provider … android:authorities="${applicationId}.fileprovider">`),
# so it is the *system* that calls `openFile`/`query`/`getType`/`attachInfo`
# when Gmail reads an attachment. Those survive today only because R8 keeps
# overrides of framework methods on a kept component — an emergent property, not
# a promise. The class is a few kilobytes; stating the requirement outright is
# cheaper than debugging a silently unreadable attachment later.
#
# This file is the tracked source of truth: src-tauri/gen is gitignored, so
# apk-export.ps1 copies it to src-tauri/gen/android/app/ before every build
# (`proguardFiles` picks up every *.pro in that directory).

-keep class androidx.core.content.FileProvider { *; }
