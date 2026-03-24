// Image optimization utilities for Next.js
const imageCache = new Map<string, { url: string; timestamp: number }>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

export interface ThumbnailSizes {
  thumbnail: string; // Small preview (150px)
  preview: string; // Medium quality (400px)
  highres: string; // Original or high quality
}

/**
 * Upload image and generate thumbnails via API
 * @param file The image file to process
 * @returns Promise resolving to thumbnail URLs
 */
export async function generateThumbnails(file: File): Promise<ThumbnailSizes> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to upload image");
  }

  const data = await response.json();
  return {
    thumbnail: data.thumbnail,
    preview: data.preview,
    highres: data.highres,
  };
}

/**
 * Generate optimized image URL with size and quality parameters
 */
export function getOptimizedImageUrl(
  url: string,
  width: number,
  quality: number = 70,
): string {
  // For uploaded images in public folder, return as-is
  if (url.startsWith("/uploads/")) {
    return url;
  }

  // For static images in public folder, don't add query params
  if (url.startsWith("/images/") || url.startsWith("/")) {
    return url;
  }

  return url;
}

/**
 * Get thumbnail URL with aggressive compression
 */
export function getThumbnailUrl(url: string): string {
  return getOptimizedImageUrl(url, 200, 50);
}

/**
 * Get medium quality URL for preview
 */
export function getPreviewUrl(url: string): string {
  return getOptimizedImageUrl(url, 400, 65);
}

/**
 * Get high quality URL
 */
export function getHighResUrl(url: string): string {
  return getOptimizedImageUrl(url, 1200, 85);
}

/**
 * Cache busting for development
 */
export function getCacheKey(url: string): string {
  return `${url}#${Math.floor(Date.now() / 60000)}`; // Cache per minute
}

/**
 * Preload images for better perceived performance
 */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Batch preload multiple images
 */
export function preloadImages(
  urls: string[],
): Promise<PromiseSettledResult<void>[]> {
  return Promise.allSettled(urls.map(preloadImage));
}

/**
 * Calculate optimal tile size based on viewport
 */
export function calculateOptimalGridSize(
  imageCount: number,
  maxTiles: number = 225,
): number {
  if (imageCount === 0) return 15;

  const calculated = Math.floor(Math.sqrt(imageCount));
  const maxGridSize = Math.floor(Math.sqrt(maxTiles));

  return Math.max(8, Math.min(calculated, maxGridSize));
}
