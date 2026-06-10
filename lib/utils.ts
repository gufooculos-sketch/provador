/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const urlToFile = async (url: string, filename: string): Promise<File> => {
    // 1. If it's a data URL or blob URL, fetch directly
    if (url.startsWith('data:') || url.startsWith('blob:')) {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const mimeType = blob.type || 'image/png';
            return new File([blob], filename, { type: mimeType });
        } catch (err) {
            console.error('[urlToFile] Direct fetch of local/data/blob URL failed:', err);
        }
    }

    // List of fetch attempts to try in sequence
    const fetchWithFallback = async (): Promise<Blob> => {
        // Try A: Direct fetch first (allows CORS if supported directly by server)
        try {
            const response = await fetch(url);
            if (response.ok) {
                return await response.blob();
            }
        } catch (e) {
            console.warn('[urlToFile] Direct fetch failed (likely CORS). Trying proxies...', e);
        }

        // Try B: images.weserv.nl (Superior CORS image proxy, preserving transparency flawlessly)
        try {
            const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&default=404`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                return await response.blob();
            }
        } catch (e) {
            console.warn('[urlToFile] Proxy images.weserv.nl failed, trying next...', e);
        }

        // Try C: corsproxy.io (Very robust, long running, doesn't require registration)
        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                return await response.blob();
            }
        } catch (e) {
            console.warn('[urlToFile] Proxy corsproxy.io failed:', e);
        }

        // Try C: Allorigins.win (Another excellent public proxy)
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                return await response.blob();
            }
        } catch (e) {
            console.warn('[urlToFile] Proxy allorigins failed:', e);
        }

        throw new Error('All CORS proxies failed to load the image.');
    };

    try {
        const blob = await fetchWithFallback();
        const mimeType = blob.type || 'image/png';
        return new File([blob], filename, { type: mimeType });
    } catch (err) {
        console.warn('[urlToFile] All fetch attempts failed. Falling back to classic canvas Image loader...', err);
        
        // 3. Fallback to image-canvas loading if fetch is completely unavailable
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.setAttribute('crossOrigin', 'anonymous');

            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context.'));
                }
                ctx.drawImage(image, 0, 0);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        return reject(new Error('Canvas toBlob failed.'));
                    }
                    const mimeType = blob.type || 'image/png';
                    const file = new File([blob], filename, { type: mimeType });
                    resolve(file);
                }, 'image/png');
            };

            image.onerror = (error) => {
                reject(new Error(`Could not load image from URL for canvas conversion. Error: ${error}`));
            };

            image.src = url;
        });
    }
};

export function getFriendlyErrorMessage(error: unknown, context: string): string {
    let rawMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
        rawMessage = error.message;
    } else if (typeof error === 'string') {
        rawMessage = error;
    } else if (error) {
        rawMessage = String(error);
    }

    // Check for specific unsupported MIME type error from Gemini API
    if (rawMessage.includes("Unsupported MIME type")) {
        try {
            // It might be a JSON string like '{"error":{"message":"..."}}'
            const errorJson = JSON.parse(rawMessage);
            const nestedMessage = errorJson?.error?.message;
            if (nestedMessage && nestedMessage.includes("Unsupported MIME type")) {
                const mimeType = nestedMessage.split(': ')[1] || 'unsupported';
                return `Tipo de arquivo '${mimeType}' não é suportado. Por favor, use PNG, JPEG ou WEBP.`;
            }
        } catch (e) {
            // Not a JSON string, but contains the text. Fallthrough to generic message.
        }
        // Generic fallback for any "Unsupported MIME type" error
        return `Formato de arquivo não suportado. Por favor utilize PNG, JPEG ou WEBP.`;
    }

    if (rawMessage.includes("429") || rawMessage.includes("RESOURCE_EXHAUSTED") || rawMessage.includes("quota") || rawMessage.includes("rate-limit")) {
        return "Limite de cota excedido (Erro 429). Você atingiu os limites da API do Gemini para o período atual. Por favor, aguarde alguns instantes antes de tentar novamente.";
    }
    
    return `${context}. ${rawMessage}`;
}