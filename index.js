process.env.NTBA_FIX_350 = '1';
const { createBotApp } = require('./src/app/createBotApp');
createBotApp()
  .then(({ container }) => {
    console.log(
      `Dạ Simple Bot đang chạy rồi ạ 🌸... [storage=${container.runtime.useMongo ? 'mongo' : 'local-fallback'}, media=${container.providers.mediaProvider.isSupported() ? 'minio' : 'unsupported'}]`
    );
  })
  .catch((error) => {
    console.error('Failed to start bot:', error.message);
    process.exit(1);
  });
