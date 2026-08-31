/**
 * A small strftime for the live preview.
 *
 * It mirrors the subset of conversions that Pebble's newlib strftime supports,
 * so what you see in the browser is what the watch will render. Anything it
 * does not recognize is passed through untouched, exactly like strftime does.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number, len = 2, ch = '0') => String(n).padStart(len, ch);

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

/** ISO-8601 week number, matching %V. */
function isoWeek(d: Date): number {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

export function strftime(format: string, d: Date): string {
  let out = '';
  for (let i = 0; i < format.length; i++) {
    if (format[i] !== '%') {
      out += format[i];
      continue;
    }
    i++;
    const spec = format[i];
    const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    switch (spec) {
      case 'a': out += DAYS[d.getDay()]!.slice(0, 3); break;
      case 'A': out += DAYS[d.getDay()]!; break;
      case 'b': case 'h': out += MONTHS[d.getMonth()]!.slice(0, 3); break;
      case 'B': out += MONTHS[d.getMonth()]!; break;
      case 'd': out += pad(d.getDate()); break;
      case 'e': out += pad(d.getDate(), 2, ' '); break;
      case 'H': out += pad(d.getHours()); break;
      case 'I': out += pad(hour12); break;
      case 'j': out += pad(dayOfYear(d), 3); break;
      case 'm': out += pad(d.getMonth() + 1); break;
      case 'M': out += pad(d.getMinutes()); break;
      case 'p': out += d.getHours() < 12 ? 'AM' : 'PM'; break;
      case 'S': out += pad(d.getSeconds()); break;
      case 'u': out += String(d.getDay() === 0 ? 7 : d.getDay()); break;
      case 'w': out += String(d.getDay()); break;
      case 'y': out += pad(d.getFullYear() % 100); break;
      case 'Y': out += String(d.getFullYear()); break;
      case 'V': out += pad(isoWeek(d)); break;
      case 'D': out += `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${pad(d.getFullYear() % 100)}`; break;
      case 'F': out += `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; break;
      case 'R': out += `${pad(d.getHours())}:${pad(d.getMinutes())}`; break;
      case 'T': out += `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; break;
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case '%': out += '%'; break;
      case undefined: out += '%'; break;
      default: out += `%${spec}`; break;
    }
  }
  return out;
}

/** Mirrors the leading-zero strip the generated C code performs. */
export function stripLeadingZero(s: string): string {
  return s.startsWith('0') && s.length > 1 ? s.slice(1) : s;
}
