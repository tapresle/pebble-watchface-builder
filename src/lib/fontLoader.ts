/**
 * Registers uploaded font files with the browser so the canvas can preview the
 * user's own typeface, and exposes the CSS needed to draw any FontRef.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CustomFont, FontRef } from '../types';
import { base64ToUint8Array } from './utils';
import { SYSTEM_FONTS, systemFont } from './platform';

const loaded = new Map<string, FontFace>();

export const customFontFamily = (id: string): string => `pwb-${id}`;

async function ensureLoaded(font: CustomFont): Promise<void> {
  if (loaded.has(font.id)) return;
  const bytes = base64ToUint8Array(font.data);
  const face = new FontFace(customFontFamily(font.id), bytes.buffer as ArrayBuffer);
  await face.load();
  document.fonts.add(face);
  loaded.set(font.id, face);
}

/**
 * Loads every project font and returns a counter that changes once they are
 * ready, so consumers re-render with the real glyphs.
 */
export function useCustomFonts(fonts: CustomFont[]): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let canceled = false;
    const pending = fonts.filter((f) => !loaded.has(f.id));
    if (!pending.length) return;
    Promise.allSettled(pending.map(ensureLoaded)).then(() => {
      if (!canceled) setVersion((v) => v + 1);
    });
    return () => {
      canceled = true;
    };
  }, [fonts]);

  return version;
}

/**
 * Cap-height-to-em ratio of a CSS font stack, measured from what the browser
 * actually resolved. Measuring beats a hardcoded table: if a web font has not
 * loaded, or is blocked, this reports the fallback's ratio and the preview
 * stays the right size rather than silently drifting.
 */
const capRatioCache = new Map<string, number>();

function capRatio(stack: string, weight: number): number {
  const key = `${weight}|${stack}`;
  const cached = capRatioCache.get(key);
  if (cached !== undefined) return cached;

  const ctx = document.createElement('canvas').getContext('2d');
  let ratio = 0.71; // A typical grotesque, used if measuring is unavailable.
  if (ctx) {
    ctx.font = `${weight} 100px ${stack}`;
    const ascent = ctx.measureText('0123456789ABCDEFH').actualBoundingBoxAscent;
    if (ascent > 0) ratio = ascent / 100;
  }
  capRatioCache.set(key, ratio);
  return ratio;
}

/**
 * Web fonts arrive after first paint, so anything measured before then is the
 * fallback's ratio. This clears the cache once they land and returns a counter
 * consumers can re-render on.
 */
export function useSystemFontMetrics(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    // A browser will not fetch a web font until something renders in it, so
    // waiting on document.fonts.ready alone measures the fallback and stops.
    // Ask for each face up front, then re-measure.
    void Promise.all(
      SYSTEM_FONTS.map((sf) =>
        document.fonts.load(`${sf.cssWeight} 40px ${sf.cssStack}`).catch(() => undefined),
      ),
    )
      .then(() => document.fonts.ready)
      .then(() => {
        if (!live) return;
        capRatioCache.clear();
        setVersion((v) => v + 1);
      });
    return () => {
      live = false;
    };
  }, []);
  return version;
}

/** CSS that approximates how the Pebble will rasterize this font reference. */
export function fontStyle(font: FontRef, fonts: CustomFont[]): CSSProperties {
  if (font.kind === 'system') {
    const sf = systemFont(font.key);
    // Size the stand-in so its capitals are as tall as the real font's, rather
    // than guessing a multiplier off the nominal size.
    const size = sf.capHeight / capRatio(sf.cssStack, sf.cssWeight);
    return {
      fontFamily: sf.cssStack,
      fontWeight: sf.cssWeight,
      fontSize: `${Math.round(size * 100) / 100}px`,
      lineHeight: `${sf.height}px`,
    };
  }
  const source = fonts.find((f) => f.id === font.fontId);
  return {
    fontFamily: source
      ? `'${customFontFamily(source.id)}', 'Inter', sans-serif`
      : `'Inter', sans-serif`,
    fontWeight: 400,
    fontSize: `${font.size}px`,
    lineHeight: `${Math.round(font.size * 1.16)}px`,
  };
}

/** Human label for a font reference, for the inspector and layer list. */
export function fontLabel(font: FontRef, fonts: CustomFont[]): string {
  if (font.kind === 'system') return systemFont(font.key).label;
  const source = fonts.find((f) => f.id === font.fontId);
  return source ? `${source.identifier} @ ${font.size}px` : `Missing font @ ${font.size}px`;
}
