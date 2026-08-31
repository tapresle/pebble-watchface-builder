/**
 * Shared analysis pass over a project.
 *
 * Both the C generator and the package.json / instructions generators need to
 * know which resources are actually referenced and which watch services have to
 * be subscribed to, so that work happens once here.
 */

import type { CustomFont, ImageAsset, WatchfaceProject } from '../types';
import { formatNeedsSeconds, platformSpec } from '../lib/platform';

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
}

export interface ProjectAnalysis {
  fonts: UsedFont[];
  images: UsedImage[];
  needsBattery: boolean;
  needsBluetooth: boolean;
  needsHealth: boolean;
  needsHeartRate: boolean;
  needsSeconds: boolean;
  /** Any weather element, which is what pulls in the phone companion. */
  needsWeather: boolean;
  /** A weather element that draws artwork, which needs the icon helper. */
  needsWeatherIcon: boolean;
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
  const warnings: string[] = [];

  let needsBattery = false;
  let needsBluetooth = project.options.vibeOnDisconnect;
  let needsHealth = false;
  let needsHeartRate = false;
  let needsSeconds = project.options.forceSecondTicks;
  let needsWeather = false;
  let needsWeatherIcon = false;
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
        }
        break;
      case 'weather':
        needsWeather = true;
        if (el.field === 'icon') needsWeatherIcon = true;
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
        // graphics_draw_bitmap_in_rect neither scales nor stretches, so each
        // size an image is drawn at needs its own bitmap resource.
        const key = `${asset.id}@${el.w}x${el.h}`;
        if (!imageMap.has(key)) {
          imageMap.set(key, {
            asset,
            width: el.w,
            height: el.h,
            resourceId: asset.identifier,
            varName: `s_bmp_${cIdent(asset.identifier)}`,
          });
        }
        break;
      }
      default:
        break;
    }
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

  if (needsWeather && !project.options.weatherApiKey.trim()) {
    warnings.push(
      'This face shows weather but has no OpenWeatherMap API key. Add one on the Project tab, ' +
        'or the companion will have nothing to fetch with.',
    );
  }

  return {
    fonts: [...fontMap.values()],
    images,
    needsBattery,
    needsBluetooth,
    needsHealth,
    needsHeartRate,
    needsSeconds,
    needsWeather,
    needsWeatherIcon,
    needsCompass,
    drawOrder,
    warnings,
  };
}
