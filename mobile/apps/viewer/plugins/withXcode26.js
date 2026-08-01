const { withDangerousMod } = require("expo/config-plugins");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

/**
 * Xcode 26 compatibility for React Native 0.81's precompiled iOS artifacts.
 *
 * React Native 0.81 stopped compiling its iOS dependencies from source and
 * started shipping them as prebuilt binaries — ReactNativeDependencies.xcframework
 * and a prebuilt hermes-engine. That is a large build-time win and the reason
 * 0.81 advertises faster iOS builds.
 *
 * Xcode 26 rejects them. The failure is two script phases dying with a nonzero
 * exit code and no useful message:
 *
 *     ReactNativeDependencies  Command PhaseScriptExecution failed
 *     hermes-engine            Command PhaseScriptExecution failed
 *
 * Two things fix it, and this plugin does both because they address different
 * halves and neither is reliable alone:
 *
 *   SWIFT_ENABLE_EXPLICIT_MODULES = NO
 *     Xcode 26 turned explicit modules on by default. The prebuilt frameworks
 *     were not built for it, and the module verification fails.
 *
 *   RCT_USE_RN_DEP=0, RCT_USE_PREBUILT_RNCORE=0 (set by `npm run pods`)
 *     Falls back to compiling from source, which is what every React Native
 *     before 0.81 did. Slower to build, and known to work.
 *
 * WHY A PLUGIN RATHER THAN A NOTE IN THE README. `ios/` is generated: any change
 * made there by hand is destroyed by the next `expo prebuild`, which `npm run
 * clean` and every fresh clone will run. A fix that has to be reapplied by hand
 * after every clean is not a fix, it is a recurring tax — and the person paying
 * it will not remember why.
 *
 * Delete this plugin once the toolchain catches up. It exists for a specific
 * pairing — SDK 54 / RN 0.81.x against Xcode 26 — and it should not outlive it.
 */
const SETTING = "SWIFT_ENABLE_EXPLICIT_MODULES";

const POST_INSTALL = `
    # Added by plugins/withXcode26.js — see that file for why.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['${SETTING}'] = 'NO'
      end
    end
    installer.pods_project.build_configurations.each do |config|
      config.build_settings['${SETTING}'] = 'NO'
    end
`;

module.exports = function withXcode26(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = join(cfg.modRequest.platformProjectRoot, "Podfile");
      const source = readFileSync(podfile, "utf8");

      if (source.includes(SETTING)) return cfg;

      // Expo's template always emits a `post_install do |installer|` block.
      // Append inside it rather than adding a second one: CocoaPods silently
      // runs only the last post_install hook defined, so a second block would
      // discard everything Expo put in the first.
      const marker = /post_install do \|installer\|\n/;
      if (!marker.test(source)) {
        throw new Error(
          "withXcode26: no `post_install do |installer|` block in the Podfile. " +
            "The Expo template changed; update this plugin rather than deleting it.",
        );
      }

      writeFileSync(podfile, source.replace(marker, (m) => m + POST_INSTALL));
      return cfg;
    },
  ]);
};
