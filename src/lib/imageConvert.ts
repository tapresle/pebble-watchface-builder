/**
 * Reducing uploaded PNGs to what the target watch can actually display.
 *
 * The Pebble resource compiler does this itself at build time - 64 colors on
 * Emery, black and white on Flint - but it happens out of sight, so an editor
 * that skips it is showing something the watch will never draw. Doing it here
 * means the preview and the file in the exported project are the same image,
 * and the SDK's own pass has nothing left to decide.
 */

import { useEffect, useState } from 'react';
import type { ImageAsset } from '../types';
import type { PlatformSpec } from './platform';

/** 'flat' takes the nearest displayable color; 'dither' diffuses the error. */
export type ReduceMode = 'flat' | 'dither';

export interface ReduceOptions {
  mode: ReduceMode;
  /** Black-and-white cut-off, as a percentage. Unused on a color target. */
  threshold: number;
}

/**
 * Line art wants a clean cut-off, so mono defaults to flat. Flattening to 64
 * colors bands badly on anything photographic, so color defaults to dither.
 */
export function defaultReduce(colorMode: PlatformSpec['colorMode']): ReduceOptions {
  return { mode: colorMode === 'bw' ? 'flat' : 'dither', threshold: 50 };
}

/** An image keeps no setting until the user picks one, so the default follows the watch. */
export function reduceOptions(asset: ImageAsset, colorMode: PlatformSpec['colorMode']): ReduceOptions {
  return asset.reduce ?? defaultReduce(colorMode);
}

export type Compositing = 'assign' | 'set';

/**
 * On a color screen GCompOpSet is what honors a PNG's alpha, so a cut-out wants
 * it. On a 1-bit screen it ignores alpha entirely and treats the black pixels as
 * the mask - painting white wherever the source is black and leaving the rest
 * untouched - so an ordinary image drawn that way comes out inverted, or
 * disappears against a matching background. Default to Assign everywhere except
 * a color target with real transparency.
 */
export function compositingFor(
  asset: ImageAsset,
  colorMode: PlatformSpec['colorMode'],
): Compositing {
  if (asset.compositing) return asset.compositing;
  return colorMode === 'color' && asset.hasAlpha ? 'set' : 'assign';
}

export interface TargetSize {
  width: number;
  height: number;
}

/** Identifies one rendition of an asset: a palette, a size, and a draw mode. */
export function variantKey(assetId: string, size: TargetSize): string {
  return `${assetId}@${size.width}x${size.height}`;
}

const cacheKey = (
  asset: ImageAsset,
  opts: ReduceOptions,
  colorMode: string,
  size: TargetSize,
  compositing: Compositing | 'file',
) =>
  `${asset.id}:${asset.data.length}:${colorMode}:${opts.mode}:${opts.threshold}:` +
  `${size.width}x${size.height}:${compositing}`;

const cache = new Map<string, string>();

const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Each channel on a color Pebble is 2 bits: 0, 85, 170, or 255. */
const CHANNEL_STEP = 255 / 3;
const quantizeChannel = (v: number) =>
  Math.round(Math.min(255, Math.max(0, v)) / CHANNEL_STEP) * CHANNEL_STEP;

function decode(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode PNG'));
    img.src = `data:image/png;base64,${base64}`;
  });
}

function monoFlat(data: Uint8ClampedArray, cutoff: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const value = luminance(data[i]!, data[i + 1]!, data[i + 2]!) >= cutoff ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
}

function colorFlat(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = quantizeChannel(data[i]!);
    data[i + 1] = quantizeChannel(data[i + 1]!);
    data[i + 2] = quantizeChannel(data[i + 2]!);
  }
}

/**
 * Floyd-Steinberg error diffusion. `channels` is 1 for a black-and-white target
 * (working on luminance) and 3 for a color one (each channel independently).
 */
function dither(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 3,
  pick: (value: number) => number,
): void {
  const buf = new Float32Array(width * height * channels);
  for (let i = 0, p = 0; i < data.length; i += 4, p += channels) {
    if (channels === 1) {
      buf[p] = luminance(data[i]!, data[i + 1]!, data[i + 2]!);
    } else {
      buf[p] = data[i]!;
      buf[p + 1] = data[i + 1]!;
      buf[p + 2] = data[i + 2]!;
    }
  }

  const spread = (p: number, error: number[], factor: number) => {
    for (let c = 0; c < channels; c++) buf[p + c] = buf[p + c]! + (error[c]! * factor) / 16;
  };

  const rowStride = width * channels;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * rowStride + x * channels;
      const error: number[] = [];
      for (let c = 0; c < channels; c++) {
        const old = buf[p + c]!;
        const next = pick(old);
        buf[p + c] = next;
        error[c] = old - next;
      }
      if (x + 1 < width) spread(p + channels, error, 7);
      if (y + 1 < height) {
        if (x > 0) spread(p + rowStride - channels, error, 3);
        spread(p + rowStride, error, 5);
        if (x + 1 < width) spread(p + rowStride + channels, error, 1);
      }
    }
  }

  for (let i = 0, p = 0; i < data.length; i += 4, p += channels) {
    if (channels === 1) {
      const v = buf[p]!;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    } else {
      data[i] = buf[p]!;
      data[i + 1] = buf[p + 1]!;
      data[i + 2] = buf[p + 2]!;
    }
  }
}

/**
 * Returns a base64 PNG reduced to the target watch's palette. Alpha is left
 * alone, so a transparent cut-out still composites the way GCompOpSet draws it.
 */
export async function reduceImage(
  asset: ImageAsset,
  opts: ReduceOptions,
  colorMode: PlatformSpec['colorMode'],
  size: TargetSize,
): Promise<string> {
  const key = cacheKey(asset, opts, colorMode, size, 'file');
  const hit = cache.get(key);
  if (hit) return hit;

  const img = await decode(asset.data);
  const canvas = document.createElement('canvas');
  // graphics_draw_bitmap_in_rect does not scale - it clips or tiles - so the
  // bitmap has to be built at exactly the size it will be drawn at.
  canvas.width = Math.max(1, Math.round(size.width));
  canvas.height = Math.max(1, Math.round(size.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return asset.data;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cutoff = (Math.max(0, Math.min(100, opts.threshold)) / 100) * 255;

  if (colorMode === 'bw') {
    if (opts.mode === 'dither') {
      dither(frame.data, canvas.width, canvas.height, 1, (v) => (v >= cutoff ? 255 : 0));
    } else {
      monoFlat(frame.data, cutoff);
    }
  } else if (opts.mode === 'dither') {
    dither(frame.data, canvas.width, canvas.height, 3, quantizeChannel);
  } else {
    colorFlat(frame.data);
  }

  ctx.putImageData(frame, 0, 0);
  const out = canvas.toDataURL('image/png').split(',')[1] ?? asset.data;
  cache.set(key, out);
  return out;
}

/**
 * What the watch will actually put on screen: the reduced image, plus the effect
 * of its compositing mode. Only GCompOpSet on a 1-bit screen changes anything
 * visible, and it changes a lot, so the canvas has to show it.
 */
export async function renderImage(
  asset: ImageAsset,
  opts: ReduceOptions,
  colorMode: PlatformSpec['colorMode'],
  size: TargetSize,
  compositing: Compositing,
): Promise<string> {
  const reduced = await reduceImage(asset, opts, colorMode, size);
  if (colorMode !== 'bw' || compositing !== 'set') return reduced;

  const key = cacheKey(asset, opts, colorMode, size, compositing);
  const hit = cache.get(key);
  if (hit) return hit;

  const img = await decode(reduced);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return reduced;
  ctx.drawImage(img, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    // Black source pixels paint white; everything else is left untouched.
    const isBlack = data[i]! < 128 && data[i + 3]! > 0;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = isBlack ? 255 : 0;
  }
  ctx.putImageData(frame, 0, 0);
  const out = canvas.toDataURL('image/png').split(',')[1] ?? reduced;
  cache.set(key, out);
  return out;
}

/** Detects whether a base64 PNG has any transparent pixels. */
export async function detectAlpha(base64: string): Promise<boolean> {
  try {
    const img = await decode(base64);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * One rendition per (image, size) pair actually used on the canvas, keyed by
 * variantKey. Size matters because the bitmap is built at its drawn size.
 */
export function useRenderedImages(
  images: ImageAsset[],
  variants: { assetId: string; size: TargetSize }[],
  colorMode: PlatformSpec['colorMode'],
): Map<string, string> {
  const [rendered, setRendered] = useState<Map<string, string>>(new Map());

  const jobs = variants
    .map((v) => ({ asset: images.find((a) => a.id === v.assetId), size: v.size }))
    .filter((j): j is { asset: ImageAsset; size: TargetSize } => !!j.asset);

  // Keyed on the cache keys rather than the arrays, so an unrelated project
  // edit does not re-run every conversion.
  const signature = jobs
    .map((j) =>
      cacheKey(
        j.asset,
        reduceOptions(j.asset, colorMode),
        colorMode,
        j.size,
        compositingFor(j.asset, colorMode),
      ),
    )
    .join('|');

  useEffect(() => {
    let live = true;
    Promise.all(
      jobs.map(
        async (j) =>
          [
            variantKey(j.asset.id, j.size),
            await renderImage(
              j.asset,
              reduceOptions(j.asset, colorMode),
              colorMode,
              j.size,
              compositingFor(j.asset, colorMode),
            ),
          ] as const,
      ),
    ).then((pairs) => {
      if (live) setRendered(new Map(pairs));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, colorMode]);

  return rendered;
}
