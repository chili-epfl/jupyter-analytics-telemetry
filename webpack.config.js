const webpack = require('webpack');

module.exports = {
  plugins: [
    new webpack.DefinePlugin({
      __CONSENT_MODE__: JSON.stringify(process.env.CONSENT_MODE || 'silent')
    })
  ]
};
