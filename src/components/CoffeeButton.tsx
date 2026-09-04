/**
 * The Buy Me a Coffee button, floating in the bottom right of the Properties
 * pane.
 *
 * Their widget renders itself with document.writeln, which does nothing once
 * the document has closed - so dropping the script tag into a React tree paints
 * no button at all. The script is loaded once with write and writeln shimmed to
 * collect what it emits, and the collected markup is placed in the host. That
 * keeps their own button rather than a hand-rolled imitation of it.
 *
 * It is the last thing in the Project pane's own scrolling content rather than
 * a floating or docked bar, so it can never cover a control and nothing else
 * has to be sized around it. A blocked or offline script leaves an empty box.
 */

import { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js';

/* data-color is baked into the widget's own markup, so it cannot read --accent
   off the document - it is the same #fa4a36 written out by hand, and has to be
   changed with the token. */
const BUTTON_ATTRS: Record<string, string> = {
  'data-name': 'bmc-button',
  'data-slug': 'tapresle',
  'data-color': '#fa4a36',
  'data-emoji': '☕',
  'data-font': 'Lato',
  'data-text': 'Buy me a coffee',
  'data-outline-color': '#000000',
  'data-font-color': '#ffffff',
  'data-coffee-color': '#FFDD00',
};

/** Never leave write and writeln shimmed because a fetch hung. */
const LOAD_TIMEOUT_MS = 10_000;

/**
 * The markup is the same every time, so it is fetched once and shared. Being a
 * singleton is also what makes this safe under StrictMode, which runs effects
 * twice: two overlapping load attempts would each shim the document and the
 * second would restore it out from under the first.
 */
let buttonHtml: Promise<string> | null = null;

function loadButtonHtml(): Promise<string> {
  if (buttonHtml) return buttonHtml;
  buttonHtml = new Promise((resolve) => {
    const captured: string[] = [];
    const realWrite = document.write;
    const realWriteln = document.writeln;
    let settled = false;

    const script = document.createElement('script');
    const finish = () => {
      if (settled) return;
      settled = true;
      document.write = realWrite;
      document.writeln = realWriteln;
      script.remove();
      resolve(captured.join(''));
    };

    const capture = ((...parts: string[]) => {
      captured.push(parts.join(''));
    }) as typeof document.write;
    document.write = capture;
    document.writeln = capture;

    script.src = SCRIPT_SRC;
    script.type = 'text/javascript';
    for (const [name, value] of Object.entries(BUTTON_ATTRS)) {
      script.setAttribute(name, value);
    }
    script.onload = finish;
    script.onerror = finish;
    setTimeout(finish, LOAD_TIMEOUT_MS);
    // The widget looks itself up by its data-name, so the tag has to be in the
    // document before it runs.
    document.head.appendChild(script);
  });
  return buttonHtml;
}

export function CoffeeButton() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;

    void loadButtonHtml().then((html) => {
      if (cancelled || !html) return;
      host.innerHTML = html;
      // The widget opens in a new tab without disclaiming the opener.
      host.querySelector('a')?.setAttribute('rel', 'noopener noreferrer');
    });

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, []);

  return <div className="coffee-button" ref={hostRef} />;
}
