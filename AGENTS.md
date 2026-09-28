# Hankan development

Canonical app source: C:/Users/gnsdu/Desktop/dev/Hankan. Earlier Documents/Codex and dated dev/outputs copies are preserved snapshots.
Android and iOS are the product targets; the web preview shares React Native UI but uses a different OCR engine. Keep photo recognition on-device and preserve user confirmation of printed dates.
Distribution: C:/Users/gnsdu/Desktop/dev/outputs/hankan-downloads. Keep APK package and signing key compatible. Verify versionCode and downloaded APK hash before reporting an update live. Use the existing private Supabase bucket hankan-builds and object hankan-latest.apk; retain the signed download URL in download.json. Do not put administrator keys or user photos in builds.
