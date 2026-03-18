const Photo = require('../../../models/Photo');

class PhotoRepository {
  constructor({ useMongo, fileStore }) {
    this.useMongo = useMongo;
    this.fileStore = fileStore;
    this.collection = 'photos';
  }

  async upsertPhoto(query, payload) {
    if (this.useMongo) {
      return Photo.findOneAndUpdate(query, payload, { new: true, upsert: true });
    }

    const records = this.fileStore.read(this.collection);
    const index = records.findIndex((item) =>
      Object.entries(query).every(([key, value]) => item[key] === value)
    );
    const nextRecord = {
      ...query,
      ...payload,
      createdAt: new Date().toISOString(),
    };

    if (index >= 0) {
      records[index] = nextRecord;
    } else {
      records.push(nextRecord);
    }

    this.fileStore.write(this.collection, records);
    return nextRecord;
  }

  async findOne(query) {
    if (this.useMongo) {
      return Photo.findOne(query);
    }

    return (
      this.fileStore
        .read(this.collection)
        .find((item) => Object.entries(query).every(([key, value]) => item[key] === value)) || null
    );
  }

  async findMany(query) {
    if (this.useMongo) {
      return Photo.find(query);
    }

    return this.fileStore
      .read(this.collection)
      .filter((item) => Object.entries(query).every(([key, value]) => item[key] === value));
  }

  async rename(query, photoName) {
    if (this.useMongo) {
      return Photo.findOneAndUpdate(query, { photoName }, { new: true });
    }

    const records = this.fileStore.read(this.collection);
    const index = records.findIndex((item) =>
      Object.entries(query).every(([key, value]) => item[key] === value)
    );

    if (index < 0) {
      return null;
    }

    records[index] = {
      ...records[index],
      photoName,
    };
    this.fileStore.write(this.collection, records);
    return records[index];
  }
}

module.exports = {
  PhotoRepository,
};
