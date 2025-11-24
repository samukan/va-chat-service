module.exports = {
  apps: [
    {
      name: 'va-chat-service',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
      },
    },
  ],
};
