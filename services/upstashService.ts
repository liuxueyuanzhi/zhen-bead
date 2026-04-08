import { Redis } from '@upstash/redis';

const env = import.meta.env as Record<string, string | undefined>;
const redisUrl = env.VITE_UPSTASH_REDIS_REST_URL || '';
const redisToken = env.VITE_UPSTASH_REDIS_REST_TOKEN || '';

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

export interface MaterialData {
  id: string;
  key: string;
  title: string;
  description: string;
  author: string;
  tags: string[];
  gridSize?: number;
  gridWidth?: number;
  gridHeight?: number;
  pixelStyle: 'CIRCLE' | 'SQUARE' | 'ROUNDED';
  grid: string[][];
  createdAt: number;
  views: number;
  likes: number;
}

const MATERIAL_LIST_KEY = 'materials:list';

export async function saveMaterialToUpstash(
  grid: string[][],
  gridWidth: number,
  gridHeight: number,
  pixelStyle: 'CIRCLE' | 'SQUARE' | 'ROUNDED',
  title: string,
  description: string,
  author: string,
  tags: string[]
): Promise<string | null> {
  try {
    const key = `material:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;

    const material: MaterialData = {
      id: key,
      key,
      title,
      description,
      author,
      tags,
      gridWidth,
      gridHeight,
      pixelStyle,
      grid,
      createdAt: Date.now(),
      views: 0,
      likes: 0,
    };

    const dataStr = JSON.stringify(material);
    const dataSize = new Blob([dataStr]).size;
    
    if (dataSize > 1024 * 1024) {
      console.error('数据过大，超过 1MB 限制');
      return null;
    }
    
    await redis.set(key, dataStr);

    await redis.lpush(MATERIAL_LIST_KEY, key);

    return key;
  } catch (error) {
    console.error('保存素材到 Upstash 失败:', error);
    return null;
  }
}

export async function getMaterialFromUpstash(key: string): Promise<MaterialData | null> {
  try {
    const data = await redis.get<MaterialData>(key);
    
    if (!data) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('从 Upstash 加载素材失败:', error);
    return null;
  }
}

export async function getMaterialList(): Promise<MaterialData[]> {
  try {
    const keys = await redis.lrange(MATERIAL_LIST_KEY, 0, 99) as string[];
    
    if (!keys || keys.length === 0) {
      return [];
    }
    
    const materials: MaterialData[] = [];
    
    for (const key of keys) {
      const data = await redis.get<MaterialData>(key);
      if (data) {
        materials.push(data);
      }
    }
    
    return materials.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('获取素材列表失败:', error);
    return [];
  }
}

export async function searchMaterials(query: string): Promise<MaterialData[]> {
  try {
    const materials = await getMaterialList();
    
    if (!query.trim()) {
      return materials;
    }

    const lowerQuery = query.toLowerCase();
    
    return materials.filter(material => {
      const titleMatch = material.title.toLowerCase().includes(lowerQuery);
      const descMatch = material.description.toLowerCase().includes(lowerQuery);
      const authorMatch = material.author.toLowerCase().includes(lowerQuery);
      const tagMatch = material.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
      
      return titleMatch || descMatch || authorMatch || tagMatch;
    });
  } catch (error) {
    console.error('搜索素材失败:', error);
    return [];
  }
}

export async function incrementMaterialViews(key: string): Promise<void> {
  try {
    const data = await redis.get<MaterialData>(key);
    if (data) {
      data.views += 1;
      await redis.set(key, JSON.stringify(data), {
        ex: 30 * 24 * 60 * 60,
      });
    }
  } catch (error) {
    console.error('增加浏览数失败:', error);
  }
}

export async function incrementMaterialLikes(key: string): Promise<number | null> {
  try {
    const data = await redis.get<MaterialData>(key);
    if (data) {
      data.likes += 1;
      await redis.set(key, JSON.stringify(data), {
        ex: 30 * 24 * 60 * 60,
      });
      return data.likes;
    }
    return null;
  } catch (error) {
    console.error('增加点赞数失败:', error);
    return null;
  }
}
