const appConfig = require('./app.json');

module.exports = () => ({
  ...appConfig,
  expo: {
    ...appConfig.expo,
    updates: {
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: "2.0.0",
    extra: {
      ...(appConfig.expo?.extra || {}),
      githubToken: process.env.GITHUB_TOKEN || '',
    },
  },
});
