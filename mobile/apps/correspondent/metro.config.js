// Metro, configured for an npm-workspaces monorepo.
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace, so edits in packages/ trigger a reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve from both node_modules trees, app first.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Do NOT walk up past the workspace root looking for modules. Without this,
//    a hoisted duplicate of React can be resolved twice and the app dies with
//    "Invalid hook call" — which reads like a bug in your own code.
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: "./src/global.css" });
