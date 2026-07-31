module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // react-native-worklets/plugin must be last. Reanimated 4 moved the plugin
    // out of react-native-reanimated; the old path fails silently and every
    // animation runs on the JS thread.
    plugins: ["react-native-worklets/plugin"],
  };
};
