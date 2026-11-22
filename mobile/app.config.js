// Adds the map library with the Google Maps Android key. The key is not in this repo: Expo's cloud builds get it
// from the GOOGLE_MAPS_ANDROID_KEY build setting (scripts/set_maps_key.sh). iPhone uses Apple Maps (no key).
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY || '' }],
  ],
});
