/**
 * 调用服务端「拼豆智能生成」接口（密钥仅部署环境配置，客户端不包含任何第三方 AI 配置）
 *
 * 说明：Capacitor / 本地静态包里没有 /api，必须用完整域名。
 * 优先 VITE_AI_GENERATE_URL；否则与素材广场一致使用 VITE_API_BASE_URL（见 .env.capacitor）。
 * 
 * ====== 本地开发模式（可删除） ======
 * 以下环境变量用于本地测试 AI 功能，正式上线前请删除！
 * VITE_PIXELBEAD_AI_API_KEY=
 * VITE_PIXELBEAD_AI_API_BASE=
 * VITE_PIXELBEAD_AI_IMAGE_MODEL=
 * ==================================
 */

const PIXEL_ART_PROMPT =
  'The style should be clean, vibrant, suitable for Perler beads (hama beads). Solid white background, clear and bold outlines, limited color palette. Centered subject.';

const resolveGenerateUrl = (): string => {
  const aiBase = (import.meta.env.VITE_AI_GENERATE_URL as string | undefined)?.trim();
  if (aiBase) {
    return `${aiBase.replace(/\/$/, '')}/api/ai/generate-image`;
  }
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (apiBase) {
    return `${apiBase.replace(/\/$/, '')}/api/ai/generate-image`;
  }
  return '/.netlify/functions/ai-generate-image';
};

const isLocalDevMode = (): boolean => {
  return !!(import.meta.env.VITE_PIXELBEAD_AI_API_KEY);
};

const getLocalDevConfig = () => ({
  apiKey: import.meta.env.VITE_PIXELBEAD_AI_API_KEY as string,
  baseUrl: (import.meta.env.VITE_PIXELBEAD_AI_API_BASE as string | undefined)?.trim() || 'https://ark.cn-beijing.volces.com/api/v3',
  model: (import.meta.env.VITE_PIXELBEAD_AI_IMAGE_MODEL as string | undefined)?.trim() || 'doubao-seedream-4-5-251128',
});

export const generatePixelArtImage = async (
  prompt: string,
  referenceImage?: string | null
): Promise<string> => {
  if (isLocalDevMode()) {
    const config = getLocalDevConfig();
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    
    const requestBody: Record<string, unknown> = {
      model: config.model,
      size: '2K',
      response_format: 'b64_json',
      n: 1,
      watermark: false,
    };

    if (referenceImage) {
      requestBody.reference_images = [referenceImage];
      requestBody.prompt =
        prompt ||
        'Convert this image to a clean 1:1 square pixel art suitable for Perler beads (hama beads). The style should be clean, vibrant, limited color palette, solid white background, clear and bold outlines, centered subject.';
    } else {
      requestBody.prompt = `A high-quality 1:1 square pixel art of ${prompt}. ${PIXEL_ART_PROMPT}`;
    }

    const res = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text();
      let errorMsg = '生成失败';
      try {
        const data = JSON.parse(text);
        errorMsg = data.error?.message || errorMsg;
      } catch {}
      throw new Error(`${errorMsg}（${res.status}）`);
    }

    const data = await res.json();
    const b64Json = data.data?.[0]?.b64_json ?? data.output?.b64_json;
    if (!b64Json) {
      throw new Error('未获取到图像，请重试');
    }
    return `data:image/png;base64,${b64Json}`;
  }

  const url = resolveGenerateUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt || '',
      referenceImage: referenceImage || undefined,
    }),
  });

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(
      '无法连接生成服务。若在 App 内使用，请用 .env.capacitor 配置 VITE_API_BASE_URL（与线上域名一致）后重新打包同步。'
    );
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string; imageDataUrl?: string };

  if (!res.ok) {
    throw new Error(data.error || `生成失败（${res.status}）`);
  }
  if (!data.imageDataUrl) {
    throw new Error(data.error || '未返回图像数据');
  }
  return data.imageDataUrl;
};
