/**
 * Image Handler — generates images via DALL-E 3 / Gemini and uploads to storage.
 * Extracted from ayn-unified/index.ts (was lines 99-215).
 */
import { uploadImageToStorage } from "../_shared/storageUpload.ts";

export async function generateImage(prompt: string): Promise<{ imageUrl: string; revisedPrompt: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('Image generation not configured');

  // Primary: DALL-E 3 via Lovable
  try {
    const res = await fetch('https://api.lovable.dev/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'url',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const imageUrl = data.data?.[0]?.url;
      const revisedPrompt = data.data?.[0]?.revised_prompt || prompt;
      if (imageUrl) return { imageUrl, revisedPrompt };
    }
  } catch (err) {
    console.warn('[image-handler] DALL-E 3 failed:', err);
  }

  // Fallback: Gemini Image
  try {
    const res = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [{ role: 'user', content: `Generate an image: ${prompt}` }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        // Check if response contains base64 image
        const b64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (b64Match) return { imageUrl: b64Match[0], revisedPrompt: prompt };
      }
    }
  } catch (err) {
    console.warn('[image-handler] Gemini image fallback failed:', err);
  }

  throw new Error('All image generation providers failed');
}

export async function uploadImageIfDataUrl(imageUrl: string, userId: string): Promise<string> {
  if (!imageUrl.startsWith('data:')) return imageUrl;
  try {
    const uploaded = await uploadImageToStorage(imageUrl, userId);
    return uploaded || imageUrl;
  } catch (err) {
    console.warn('[image-handler] Upload failed, returning data URL:', err);
    return imageUrl;
  }
}
