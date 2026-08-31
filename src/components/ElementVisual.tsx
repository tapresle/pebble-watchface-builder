/**
 * Draws one element inside its bounding box, approximating what the watch will
 * render. The canvas positions the box; this component only fills it.
 */

import type { CSSProperties } from 'react';
import type { CustomFont, ImageAsset, WatchElement, WeatherElement } from '../types';
import type { PreviewValues, PreviewWeather } from '../lib/previewValues';
import type { WeatherCondition } from '../lib/weather';
import {
  CONDITION_ICON,
  CONDITION_LABEL,
  cTenthsToDisplay,
  temperatureUnitLabel,
  windTenthsToDisplay,
  windUnitLabel,
} from '../lib/weather';
import { compassText } from '../lib/compass';
import { fontStyle } from '../lib/fontLoader';
import { strftime, stripLeadingZero } from '../lib/strftime';
import { elementBox, isAxisAlignedRect, lineDelta, polygonPoints } from '../lib/geometry';
import { variantKey } from '../lib/imageConvert';

interface Props {
  el: WatchElement;
  fonts: CustomFont[];
  images: ImageAsset[];
  values: PreviewValues;
  /** Rendered image variants, keyed by variantKey(assetId, size). */
  renderedImages: Map<string, string>;
}

const groupThousands = (n: number): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * The string one weather field renders to. Mirrors what the generated C builds
 * from the same numbers, so the preview and the watch read alike.
 */
function weatherText(el: WeatherElement, w: PreviewWeather): string {
  const deg = el.degreeSymbol ? `\u00b0${temperatureUnitLabel(el.units)}` : '';
  const temp = (tenths: number) => `${cTenthsToDisplay(tenths, el.units)}${deg}`;
  switch (el.field) {
    case 'temperature': return temp(w.tempTenths);
    case 'feelsLike': return temp(w.feelsLikeTenths);
    case 'high': return temp(w.highTenths);
    case 'low': return temp(w.lowTenths);
    case 'rainChance': return `${w.rainChance}%`;
    case 'humidity': return `${w.humidity}%`;
    case 'wind': return `${windTenthsToDisplay(w.windTenths, el.units)} ${windUnitLabel(el.units)}`;
    case 'condition': return CONDITION_LABEL[w.condition];
    case 'location': return w.location;
    default: return '';
  }
}

/**
 * Scales the normalized icon artwork into the element's box.
 *
 * The artwork is drawn into the largest square the box holds, centered, so a
 * wide or short box crops the margins rather than stretching a sun into an
 * ellipse. The generated C centers it the same way.
 */
function WeatherIcon({
  w,
  h,
  color,
  condition,
}: {
  w: number;
  h: number;
  color: string;
  condition: WeatherCondition;
}) {
  const s = Math.min(w, h);
  const ox = (w - s) / 2;
  const oy = (h - s) / 2;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {CONDITION_ICON[condition].map((shape, k) => {
        if (shape.kind === 'circle') {
          return (
            <circle key={k} cx={ox + shape.cx * s} cy={oy + shape.cy * s} r={shape.r * s} fill={color} />
          );
        }
        if (shape.kind === 'rect') {
          return (
            <rect
              key={k}
              x={ox + shape.x * s}
              y={oy + shape.y * s}
              width={shape.w * s}
              height={shape.h * s}
              fill={color}
            />
          );
        }
        const points = shape.points.map((pt) => `${ox + pt.x * s},${oy + pt.y * s}`).join(' ');
        if (shape.kind === 'path') {
          return (
            <polyline
              key={k}
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={Math.max(1, shape.width * s)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        return <polygon key={k} points={points} fill={color} />;
      })}
    </svg>
  );
}

function batteryColor(
  values: PreviewValues,
  normal: string,
  charging: string,
  low: string,
  threshold: number,
): string {
  if (values.charging) return charging;
  if (values.battery <= threshold) return low;
  return normal;
}

function textBoxStyle(
  el: Extract<WatchElement, { align: 'left' | 'center' | 'right' }>,
  fonts: CustomFont[],
  color: string,
): CSSProperties {
  return {
    ...fontStyle(el.font, fonts),
    color,
    textAlign: el.align,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  };
}

export function ElementVisual({ el, fonts, images, values, renderedImages }: Props) {
  const box = elementBox(el);

  switch (el.type) {
    case 'time': {
      let text = strftime(el.format, values.date);
      if (el.stripLeadingZero) text = stripLeadingZero(text);
      if (el.uppercase) text = text.toUpperCase();
      return <div className="el-text" style={textBoxStyle(el, fonts, el.color)}>{text}</div>;
    }

    case 'text':
      return <div className="el-text" style={textBoxStyle(el, fonts, el.color)}>{el.text}</div>;

    case 'steps': {
      const n = el.thousandsSeparator ? groupThousands(values.steps) : String(values.steps);
      return (
        <div className="el-text" style={textBoxStyle(el, fonts, el.color)}>
          {`${el.prefix}${n}${el.suffix}`}
        </div>
      );
    }

    case 'heartRate': {
      const reading = values.heartRate > 0 ? `${el.prefix}${values.heartRate}${el.suffix}` : el.placeholder;
      return <div className="el-text" style={textBoxStyle(el, fonts, el.color)}>{reading}</div>;
    }

    case 'weather': {
      if (el.field === 'icon') {
        return (
          <WeatherIcon w={el.w} h={el.h} color={el.color} condition={values.weather.condition} />
        );
      }
      const text = `${el.prefix}${weatherText(el, values.weather)}${el.suffix}`;
      return <div className="el-text" style={textBoxStyle(el, fonts, el.color)}>{text}</div>;
    }

    case 'compass': {
      const reading = compassText(values.compassHeading, el.points, el.display);
      return (
        <div className="el-text" style={textBoxStyle(el, fonts, el.color)}>
          {`${el.prefix}${reading}${el.suffix}`}
        </div>
      );
    }

    case 'batteryText': {
      const color = batteryColor(values, el.color, el.chargingColor, el.lowColor, el.lowThreshold);
      return (
        <div className="el-text" style={textBoxStyle(el, fonts, color)}>
          {`${el.prefix}${values.battery}${el.suffix}`}
        </div>
      );
    }

    case 'batteryBar': {
      const fill = batteryColor(values, el.fillColor, el.chargingColor, el.lowColor, el.lowThreshold);
      const inset = el.borderWidth + el.padding;
      const trackW = Math.max(0, el.w - inset * 2);
      const trackH = Math.max(0, el.h - inset * 2);
      const ratio = Math.max(0, Math.min(100, values.battery)) / 100;
      const levelW = el.orientation === 'horizontal' ? Math.round(trackW * ratio) : trackW;
      const levelH = el.orientation === 'horizontal' ? trackH : Math.round(trackH * ratio);
      const levelLeft =
        el.orientation === 'horizontal' && el.reverse ? trackW - levelW : 0;
      const levelTop =
        el.orientation === 'vertical' && !el.reverse ? trackH - levelH : 0;
      const frameRadius = Math.max(0, Math.min(el.radius, Math.floor(Math.min(el.w, el.h) / 2)));
      const trackRadius = Math.max(0, Math.min(el.radius, Math.floor(Math.min(trackW, trackH) / 2)));
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div
            style={{
              position: 'absolute',
              left: inset,
              top: inset,
              width: trackW,
              height: trackH,
              background: el.backgroundColor,
              borderRadius: trackRadius || undefined,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: levelLeft,
                top: levelTop,
                width: levelW,
                height: levelH,
                background: fill,
                borderRadius: trackRadius || undefined,
              }}
            />
          </div>
          {el.borderWidth > 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                border: `${el.borderWidth}px solid ${el.borderColor}`,
                borderRadius: frameRadius || undefined,
              }}
            />
          )}
        </div>
      );
    }

    case 'batteryRing': {
      const fill = batteryColor(values, el.fillColor, el.chargingColor, el.lowColor, el.lowThreshold);
      const r = Math.max(1, (el.size - el.thickness) / 2);
      const c = el.size / 2;
      const circumference = 2 * Math.PI * r;
      const sweepFraction = Math.max(0, Math.min(360, el.sweep)) / 360;
      const trackLen = circumference * sweepFraction;
      const valueLen = trackLen * (Math.max(0, Math.min(100, values.battery)) / 100);
      return (
        <svg width={el.size} height={el.size} viewBox={`0 0 ${el.size} ${el.size}`}>
          <g transform={`rotate(${-90 + el.startAngle} ${c} ${c})`}>
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={el.backgroundColor}
              strokeWidth={el.thickness}
              strokeDasharray={`${trackLen} ${circumference}`}
            />
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={fill}
              strokeWidth={el.thickness}
              strokeDasharray={`${valueLen} ${circumference}`}
            />
          </g>
        </svg>
      );
    }

    case 'bluetooth': {
      if (el.hideWhenConnected && values.bluetooth) return null;
      const color = values.bluetooth ? el.connectedColor : el.disconnectedColor;
      if (el.style === 'text') {
        const text = values.bluetooth ? el.connectedText : el.disconnectedText;
        return <div className="el-text" style={textBoxStyle(el, fonts, color)}>{text}</div>;
      }
      if (el.style === 'dot') {
        return (
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: color }} />
        );
      }
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: color,
            borderRadius:
              Math.max(0, Math.min(el.radius, Math.floor(Math.min(el.w, el.h) / 2))) || undefined,
          }}
        />
      );
    }

    case 'polygon': {
      // A rectangle is drawn as a div so the corner radius matches what the SDK
      // will do with a rounded GRect; anything else is a real path.
      if (isAxisAlignedRect(el.sides, el.rotation)) {
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: el.fill ? el.fillColor : 'transparent',
              border: el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${el.strokeColor}` : undefined,
              borderRadius: el.radius || undefined,
              boxSizing: 'border-box',
            }}
          />
        );
      }
      const inset = el.strokeWidth / 2;
      const points = polygonPoints(
        el.sides,
        el.rotation,
        Math.max(1, el.w - el.strokeWidth),
        Math.max(1, el.h - el.strokeWidth),
      )
        .map((pt) => `${pt.x + inset},${pt.y + inset}`)
        .join(' ');
      return (
        <svg width={el.w} height={el.h} viewBox={`0 0 ${el.w} ${el.h}`}>
          <polygon
            points={points}
            fill={el.fill ? el.fillColor : 'none'}
            stroke={el.strokeWidth > 0 ? el.strokeColor : 'none'}
            strokeWidth={el.strokeWidth}
            strokeLinejoin={el.roundedJoins ? 'round' : 'miter'}
          />
        </svg>
      );
    }

    case 'circle': {
      const r = Math.max(0.5, (el.size - el.strokeWidth) / 2);
      return (
        <svg width={el.size} height={el.size} viewBox={`0 0 ${el.size} ${el.size}`}>
          <circle
            cx={el.size / 2}
            cy={el.size / 2}
            r={r}
            fill={el.fill ? el.fillColor : 'none'}
            stroke={el.strokeWidth > 0 ? el.strokeColor : 'none'}
            strokeWidth={el.strokeWidth}
          />
        </svg>
      );
    }

    case 'line': {
      const { dx, dy } = lineDelta(el.length, el.angle);
      const x1 = el.x - box.x;
      const y1 = el.y - box.y;
      return (
        <svg width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} style={{ overflow: 'visible' }}>
          <line
            x1={x1}
            y1={y1}
            x2={x1 + dx}
            y2={y1 + dy}
            stroke={el.color}
            strokeWidth={Math.max(1, el.width)}
            strokeLinecap={el.roundedEnds ? 'round' : 'butt'}
          />
        </svg>
      );
    }

    case 'image': {
      const asset = images.find((a) => a.id === el.assetId);
      if (!asset) {
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              border: '1px dashed #ff5c72',
              color: '#ff5c72',
              fontSize: 8,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            no image
          </div>
        );
      }
      return (
        <img
          src={`data:image/png;base64,${renderedImages.get(variantKey(asset.id, { width: el.w, height: el.h })) ?? asset.data}`}
          alt=""
          width={el.w}
          height={el.h}
          style={{ width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' }}
        />
      );
    }

    case 'analog': {
      const c = el.size / 2;
      const radius = el.size / 2;
      const d = values.date;
      const hourAngle = ((d.getHours() % 12) * 60 + d.getMinutes()) / (12 * 60);
      const minuteAngle = d.getMinutes() / 60;
      const secondAngle = d.getSeconds() / 60;
      const tip = (fraction: number, lengthPct: number) => {
        const angle = fraction * Math.PI * 2;
        const len = (radius * lengthPct) / 100;
        return { x: c + Math.sin(angle) * len, y: c - Math.cos(angle) * len };
      };
      const tickCount = el.minuteTicks ? 60 : 12;
      return (
        <svg width={el.size} height={el.size} viewBox={`0 0 ${el.size} ${el.size}`}>
          {el.showTicks &&
            Array.from({ length: tickCount }, (_, t) => {
              const angle = (t / tickCount) * Math.PI * 2;
              const outer = { x: c + Math.sin(angle) * radius, y: c - Math.cos(angle) * radius };
              const inner = {
                x: c + Math.sin(angle) * (radius - el.tickLength),
                y: c - Math.cos(angle) * (radius - el.tickLength),
              };
              return (
                <line
                  key={t}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={el.tickColor}
                  strokeWidth={Math.max(1, el.tickWidth)}
                  strokeLinecap={el.roundedTicks ? 'round' : 'butt'}
                />
              );
            })}
          {el.showHour && (
            <line
              x1={c}
              y1={c}
              x2={tip(hourAngle, el.hourLength).x}
              y2={tip(hourAngle, el.hourLength).y}
              stroke={el.hourColor}
              strokeWidth={el.hourWidth}
              strokeLinecap={el.roundedHands ? 'round' : 'butt'}
            />
          )}
          {el.showMinute && (
            <line
              x1={c}
              y1={c}
              x2={tip(minuteAngle, el.minuteLength).x}
              y2={tip(minuteAngle, el.minuteLength).y}
              stroke={el.minuteColor}
              strokeWidth={el.minuteWidth}
              strokeLinecap={el.roundedHands ? 'round' : 'butt'}
            />
          )}
          {el.showSecond && (
            <line
              x1={c}
              y1={c}
              x2={tip(secondAngle, el.secondLength).x}
              y2={tip(secondAngle, el.secondLength).y}
              stroke={el.secondColor}
              strokeWidth={el.secondWidth}
              strokeLinecap={el.roundedHands ? 'round' : 'butt'}
            />
          )}
          {el.showCenterDot && (
            <circle cx={c} cy={c} r={el.centerDotRadius} fill={el.centerDotColor} />
          )}
        </svg>
      );
    }
  }
}
