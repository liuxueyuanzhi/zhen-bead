const PIXEL_ART_PROMPT = 'The style should be clean, vibrant, suitable for Perler beads (hama beads). Solid white background, clear and bold outlines, limited color palette. Centered subject.';

function mapUpstreamError(error) {
  if (error && typeof error === 'object' && 'error' in error) {
    const err = error.error;
    const message = (err?.message || '').toLowerCase();
    if (message.includes('api key') || message.includes('unauthorized')) {
      return '服务鉴权失败';
    }
    if (message.includes('quota') || message.includes('limit') || message.includes('rate')) {
      return '当前使用人数较多，请稍后再试';
    }
    if (message.includes('content_filter')) {
      return '内容未通过安全校验，请修改描述后重试';
    }
    if (err?.message) return '生成失败，请稍后重试';
  }
  return '生成服务暂时不可用，请稍后重试';
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.PIXELBEAD_AI_API_KEY;
  const baseUrl = (process.env.PIXELBEAD_AI_API_BASE || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
  const model = process.env.PIXELBEAD_AI_IMAGE_MODEL || 'doubao-seedream-4-5-251128';

  if (!apiKey?.trim()) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: '智能生成功能暂未开放' }) };
  }

  let body = {};
  try {
    if (event.body) body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const referenceImage = typeof body.referenceImage === 'string' ? body.referenceImage.trim() : '';

  if (!prompt && !referenceImage) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '请输入描述或上传参考图' }) };
  }
  if (prompt.length > 4000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '描述过长' }) };
  }

  const requestBody = {
    model,
    size: '2K',
    response_format: 'b64_json',
    n: 1,
    watermark: false,
  };

  if (referenceImage) {
    requestBody.reference_images = [referenceImage];
    requestBody.prompt = prompt || 'Convert this image to a clean 1:1 square pixel art suitable for Perler beads (hama beads). The style should be clean, vibrant, limited color palette, solid white background, clear and bold outlines, centered subject.';
  } else {
    requestBody.prompt = `A high-quality 1:1 square pixel art of ${prompt}. ${PIXEL_ART_PROMPT}`;
  }

  try {
    const upstream = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { statusCode: 502, headers, body: JSON.stringify({ error: '生成服务暂时不可用，请稍后重试' }) };
    }

    if (!upstream.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: mapUpstreamError(data) }) };
    }

    const b64Json = data.data?.[0]?.b64_json ?? data.output?.b64_json;
    if (!b64Json) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: '未获取到图像，请重试' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        imageDataUrl: `data:image/png;base64,${b64Json}`,
      })
    };

  } catch (error) {
    console.error('AI generation error:', error);
    return { statusCode: 502, headers, body: JSON.stringify({ error: '生成服务暂时不可用，请稍后重试' }) };
  }
};
