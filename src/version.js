import config from '../app.json';
export const APP_VERSION=config.expo.version;
export const ANDROID_BUILD=config.expo.android.versionCode;
export const IOS_BUILD=config.expo.ios.buildNumber;
