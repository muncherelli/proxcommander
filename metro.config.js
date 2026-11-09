const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

// withUniwindConfig must stay the outermost wrapper.
module.exports = withUniwindConfig(getDefaultConfig(__dirname), {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
