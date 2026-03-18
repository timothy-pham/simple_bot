const Minio = require('minio');

class MinioMediaProvider {
  constructor() {
    this.bucketName = 'telebot';
    this.supported = Boolean(
      process.env.MINIO_ENDPOINT &&
      process.env.MINIO_ACCESS_KEY &&
      process.env.MINIO_SECRET_KEY
    );

    if (this.supported) {
      this.client = new Minio.Client({
        endPoint: process.env.MINIO_ENDPOINT,
        port: Number(process.env.MINIO_PORT || 80),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY,
      });
    }
  }

  isSupported() {
    return this.supported;
  }

  async uploadObject(objectName, buffer, metaData) {
    if (!this.supported) {
      throw new Error('MinIO is unavailable');
    }

    await this.client.putObject(this.bucketName, objectName, buffer, metaData);

    const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
    const port = process.env.MINIO_PORT ? `:${process.env.MINIO_PORT}` : '';
    return `${protocol}://${process.env.MINIO_ENDPOINT}${port}/${this.bucketName}/${objectName}`;
  }
}

module.exports = {
  MinioMediaProvider,
};
