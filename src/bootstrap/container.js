const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const { connectDatabase } = require('../infrastructure/database/mongoose');
const { FileStore } = require('../infrastructure/persistence/fileStore');
const { MinioMediaProvider } = require('../infrastructure/providers/minioMediaProvider');
const { MenuRepository } = require('../infrastructure/repositories/menuRepository');
const { OrderRepository } = require('../infrastructure/repositories/orderRepository');
const { GroupMemberRepository } = require('../infrastructure/repositories/groupMemberRepository');
const { PhotoRepository } = require('../infrastructure/repositories/photoRepository');
const { AIContextRepository } = require('../infrastructure/repositories/aiContextRepository');

const createContainer = async () => {
  const dbState = await connectDatabase();
  const fileStore = new FileStore(path.join(process.cwd(), 'data', 'runtime'));
  const useMongo = dbState.connected;

  const messages = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data', 'messages.json'), 'utf8')
  );

  return {
    config: {
      adminChatId: process.env.ADMIN_CHAT_ID,
      googleApiKey: process.env.GOOGLE_API_KEY,
    },
    messages,
    repositories: {
      menuRepository: new MenuRepository({ useMongo, fileStore }),
      orderRepository: new OrderRepository({ useMongo, fileStore }),
      groupMemberRepository: new GroupMemberRepository({ useMongo, fileStore }),
      photoRepository: new PhotoRepository({ useMongo, fileStore }),
      aiContextRepository: new AIContextRepository({ useMongo, fileStore }),
    },
    providers: {
      mediaProvider: new MinioMediaProvider(),
      aiClient: process.env.GOOGLE_API_KEY
        ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
        : null,
    },
    runtime: {
      useMongo,
    },
  };
};

module.exports = {
  createContainer,
};
