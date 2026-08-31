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
 * How tall the button comes out is theirs to decide, so the host measures
 * itself and publishes the height as a custom property. The panel pads its
 * scrolling content by exactly that much and nothing ends up hidden behind the
 * button; a blocked or offline script measures zero and costs no padding.
 */

import { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js';

const BUTTON_ATTRS: Record<string, string> = {
  'data-name': 'bmc-button',
  'data-slug': 'tapresle',
  'data-color': '#FF5F5F',
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

    const panel = host.closest('.panel-right') as HTMLElement | null;
    // The panel reserves room for whatever the widget renders, which is not
    // known until it has rendered it.
    const publishHeight = () => {
      panel?.style.setProperty('--coffee-height', `${Math.ceil(host.offsetHeight)}px`);
    };
    const observer = new ResizeObserver(publishHeight);
    let cancelled = false;

    void loadButtonHtml().then((html) => {
      if (cancelled || !html) return;
      host.innerHTML = html;
      // The widget opens in a new tab without disclaiming the opener.
      host.querySelector('a')?.setAttribute('rel', 'noopener noreferrer');
      publishHeight();
      observer.observe(host);
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      panel?.style.removeProperty('--coffee-height');
      host.replaceChildren();
    };
  }, []);

  return <div className="coffee-button" ref={hostRef} />;
}
