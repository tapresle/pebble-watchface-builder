/**
 * Shared analysis pass over a project.
 *
 * Both the C generator and the package.json / instructions generators need to
 * know which resources are actually referenced and which watch services have to
 * be subscribed to, so that work happens once here.
 */

import type { CustomFont, ImageAsset, WatchfaceProject } from '../types';
import { formatNeedsSeconds, platformSpec } from '../lib/platform';
import {
  MAX_SLIDESHOW_IMAGES,
  SLIDESHOW_STORAGE_WARN_BYTES,
  bitmapBytes,
  slideshowAllowance,
} from '../lib/slideshow';

export interface UsedFont {
  font: CustomFont;
  size: number;
  /** Pebble resource identifier, e.g. 'MONTSERRAT_BOLD_42'. */
  resourceId: string;
  /** C variable holding the loaded GFont. */
  varName: string;
}

export interface UsedImage {
  asset: ImageAsset;
  /** The size it is drawn at; the bitmap is built at exactly this size. */
  width: number;
  height: number;
  resourceId: string;
  varName: string;
  /**
   * Whether an image element draws it, which loads it once at startup and
   * keeps it. A slideshow frame alone is only a resource: the slideshow loads
   * it when its turn comes and frees it when the next one does.
   */
  preload: boolean;
}

export interface ProjectAnalysis {
  fonts: UsedFont[];
  images: UsedImage[];
  /** Each visible slideshow's frames, in order, after the face-wide cap. */
  slideshowFrames: Map<string, UsedImage[]>;
  needsBattery: boolean;
  needsBluetooth: boolean;
  needsHealth: boolean;
  needsHeartRate: boolean;
  needsSeconds: boolean;
  /** Any weather element, which is what pulls in the phone companion. */
  needsWeather: boolean;
  /** A weather element that draws artwork, which needs the icon helper. */
  needsWeatherIcon: boolean;
  /** Any calendar element, which is what pulls in the phone companion. */
  needsCalendar: boolean;
  /** Any compass element, which powers up the magnetometer. */
  needsCompass: boolean;
  /** Elements that will actually be drawn, bottom layer first. */
  drawOrder: WatchfaceProject['elements'];
  warnings: string[];
}

const cIdent = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, '_');

export function analyzeProject(project: WatchfaceProject): ProjectAnalysis {
  const spec = platformSpec(project.platform);
  const fontMap = new Map<string, UsedFont>();
  const imageMap = new Map<string, UsedImage>();
  const slideshowFrames = new Map<string, UsedImage[]>();
  const allowance = slideshowAllowance(project.elements);
  const warnings: string[] = [];

  // graphics_draw_bitmap_in_rect neither scales nor stretches, so each size an
  // image is drawn at needs its own bitmap resource.
  const useImage = (asset: ImageAsset, w: number, h: number, preload: boolean): UsedImage => {
    const key = `${asset.id}@${w}x${h}`;
    let used = imageMap.get(key);
    if (!used) {
      used = {
        asset,
        width: w,
        height: h,
        resourceId: asset.identifier,
        varName: `s_bmp_${cIdent(asset.identifier)}`,
        preload,
      };
      imageMap.set(key, used);
    }
    if (preload) used.preload = true;
    return used;
  };

  let needsBattery = false;
  let needsBluetooth = project.options.vibeOnDisconnect;
  let needsHealth = false;
  let needsHeartRate = false;
  let needsSeconds = project.options.forceSecondTicks;
  let needsWeather = false;
  let needsWeatherIcon = false;
  let needsCalendar = false;
  let needsCompass = false;

  const drawOrder = project.elements.filter((el) => el.visible);

  for (const el of drawOrder) {
    const fontRef = 'font' in el ? el.font : null;
    if (fontRef) {
      if (fontRef.kind === 'custom') {
        const source = project.fonts.find((f) => f.id === fontRef.fontId);
        if (!source) {
          warnings.push(`"${el.name}" points at a font that is no longer in the project.`);
        } else {
          const size = Math.round(fontRef.size);
          const key = `${source.id}:${size}`;
          if (!fontMap.has(key)) {
            const resourceId = `${source.identifier}_${size}`;
            fontMap.set(key, {
              font: source,
              size,
              resourceId,
              varName: `s_font_${cIdent(resourceId)}`,
            });
          }
        }
      }
    }

    switch (el.type) {
      case 'time':
        if (formatNeedsSeconds(el.format)) needsSeconds = true;
        break;
      case 'batteryText':
      case 'batteryBar':
      case 'batteryRing':
        needsBattery = true;
        break;
      case 'bluetooth':
        needsBluetooth = true;
        break;
      case 'steps':
        needsHealth = true;
        break;
      case 'heartRate':
        needsHealth = true;
        needsHeartRate = true;
        if (!spec.hasHeartRate) {
          warnings.push(
            `"${el.name}" reads the heart rate sensor, which the ${spec.name} does not have. ` +
              `It will always show its placeholder.`,
          );
        } else if (spec.heartRateOptional) {
          warnings.push(
            `"${el.name}" reads the heart rate sensor, which only some ${spec.name} models have. ` +
              `On one without it, this shows its placeholder.`,
          );
        }
        break;
      case 'weather':
        needsWeather = true;
        if (el.field === 'icon') needsWeatherIcon = true;
        break;
      case 'calendar':
        needsCalendar = true;
        break;
      case 'compass':
        needsCompass = true;
        if (!spec.hasCompass) {
          warnings.push(
            `"${el.name}" reads the compass, which the ${spec.name} has no magnetometer for. ` +
              `It will always show its placeholder.`,
          );
        }
        break;
      case 'analog':
        if (el.showSecond) needsSeconds = true;
        break;
      case 'image': {
        const asset = project.images.find((a) => a.id === el.assetId);
        if (!asset) {
          warnings.push(`"${el.name}" has no image assigned - it will be skipped in the export.`);
          break;
        }
        useImage(asset, el.w, el.h, true);
        break;
      }
      case 'slideshow': {
        const kept = allowance.get(el.id) ?? 0;
        const over = kept < el.assetIds.length;
        if (over) {
          warnings.push(
            `"${el.name}" goes past the limit of ${MAX_SLIDESHOW_IMAGES} slideshow images for the ` +
              `whole face, so ` +
              (kept === 0
                ? 'none of its images are exported and it will be skipped.'
                : `only its first ${kept === 1 ? 'one is' : `${kept} are`} exported.`),
          );
        }
        const frames = el.assetIds
          .slice(0, kept)
          .map((id) => project.images.find((a) => a.id === id))
          .filter((a): a is ImageAsset => a !== undefined)
          .map((asset) => useImage(asset, el.w, el.h, false));
        if (!frames.length) {
          if (!(over && kept === 0)) {
            warnings.push(`"${el.name}" has no images - it will be skipped in the export.`);
          }
          break;
        }
        slideshowFrames.set(el.id, frames);
        // One frame is decoded at a time, but it has to share the app's memory
        // with everything else, and a PNG needs room to decode into as well.
        const bytes = bitmapBytes(el.w, el.h, spec.colorMode);
        if (bytes > (spec.appMemoryKB * 1024) / 2) {
          warnings.push(
            `"${el.name}" is ${el.w}x${el.h}, which takes about ${Math.round(bytes / 1024)} KB of ` +
              `the ${spec.appMemoryKB} KB the ${spec.name} gives an app each time an image loads. ` +
              `It may fail to load; a smaller box is safer.`,
          );
        }
        break;
      }
      default:
        break;
    }
  }

  const slideshowBytes = [...new Set([...slideshowFrames.values()].flat())].reduce(
    (n, img) => n + bitmapBytes(img.width, img.height, spec.colorMode),
    0,
  );
  if (slideshowBytes > SLIDESHOW_STORAGE_WARN_BYTES) {
    warnings.push(
      `The slideshow images come to about ${Math.round(slideshowBytes / 1024)} KB once decoded, ` +
        `which may not fit in the app's resource space. If the build fails, use fewer or smaller images.`,
    );
  }

  // Only disambiguate identifiers when an image really is used at more than one
  // size, so the common case keeps the name the user typed.
  const images = [...imageMap.values()];
  for (const asset of new Set(images.map((i) => i.asset.id))) {
    const sizes = images.filter((i) => i.asset.id === asset);
    if (sizes.length < 2) continue;
    for (const image of sizes) {
      image.resourceId = `${image.asset.identifier}_${image.width}X${image.height}`;
      image.varName = `s_bmp_${cIdent(image.resourceId)}`;
    }
  }

  return {
    fonts: [...fontMap.values()],
    images,
    slideshowFrames,
    needsBattery,
    needsBluetooth,
    needsHealth,
    needsHeartRate,
    needsSeconds,
    needsWeather,
    needsWeatherIcon,
    needsCalendar,
    needsCompass,
    drawOrder,
    warnings,
  };
}
