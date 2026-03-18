const fs = require('fs');
const path = require('path');

class FileStore {
  constructor(basePath) {
    this.basePath = basePath;
    this.ensureBasePath();
  }

  ensureBasePath() {
    fs.mkdirSync(this.basePath, { recursive: true });
  }

  getFilePath(collection) {
    return path.join(this.basePath, `${collection}.json`);
  }

  read(collection) {
    const filePath = this.getFilePath(collection);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return content ? JSON.parse(content) : [];
    } catch (error) {
      console.error(`Failed to read store ${collection}:`, error.message);
      return [];
    }
  }

  write(collection, records) {
    const filePath = this.getFilePath(collection);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
  }
}

module.exports = {
  FileStore,
};
