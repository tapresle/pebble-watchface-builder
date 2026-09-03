/** Turns the preview control state into the concrete values elements render. */

import { useEffect, useState } from 'react';
import type { PreviewState } from '../types';
import type { WeatherCondition } from './weather';
import { CONDITION_LABEL } from './weather';

/** The full weather reading, as the phone would have sent it. */
export interface PreviewWeather {
  condition: WeatherCondition;
  /** Tenths of a degree Celsius, matching what travels over AppMessage. */
  tempTenths: number;
  feelsLikeTenths: number;
  highTenths: number;
  lowTenths: number;
  rainChance: number;
  humidity: number;
  /** Tenths of a km/h. */
  windTenths: number;
  description: string;
  location: string;
}

export interface PreviewValues {
  date: Date;
  battery: number;
  charging: boolean;
  bluetooth: boolean;
  steps: number;
  heartRate: number;
  weather: PreviewWeather;
  /** Compass bearing in degrees clockwise from north. */
  compassHeading: number;
}

/** Ticks once a second, but only while the preview is following the real clock. */
export function useClock(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return tick;
}

export function previewValues(preview: PreviewState): PreviewValues {
  const date = preview.useLiveTime
    ? new Date()
    : new Date(preview.year, preview.month, preview.day, preview.hour, preview.minute, preview.second);
  // Only the condition, temperature, and rain chance are worth a control; the
  // rest are derived so every field still has something plausible to draw.
  const tempTenths = Math.round(preview.weatherTempC * 10);
  return {
    date,
    battery: preview.battery,
    charging: preview.charging,
    bluetooth: preview.bluetooth,
    steps: preview.steps,
    heartRate: preview.heartRate,
    compassHeading: preview.compassHeading,
    weather: {
      condition: preview.weatherCondition,
      tempTenths,
      feelsLikeTenths: tempTenths - 15,
      highTenths: tempTenths + 40,
      lowTenths: tempTenths - 55,
      rainChance: preview.weatherRainChance,
      humidity: 62,
      windTenths: 143,
      description: CONDITION_LABEL[preview.weatherCondition],
      location: 'Portland',
    },
  };
}
