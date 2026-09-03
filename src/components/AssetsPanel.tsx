/**
 * Upload and manage the two kinds of asset the Pebble SDK treats as resources:
 * custom fonts and bitmaps. Neither can be expressed in code, so this panel also
 * explains what has to be uploaded into CloudPebble by hand.
 */

import { useRef, useState } from 'react';
import { useStore } from '../store';
import { arrayBufferToBase64, formatBytes, toIdentifier, uid } from '../lib/utils';
import { customFontFamily, useCustomFonts } from '../lib/fontLoader';
import { Segmented, SliderField, TextField } from './fields';
import { CloseIcon } from './icons';
import {
  compositingFor,
  detectAlpha,
  reduceOptions,
  useRenderedImages,
  variantKey,
  type Compositing,
  type ReduceMode,
} from '../lib/imageConvert';

const base64Bytes = (data: string) => Math.floor((data.length * 3) / 4);

function Dropzone({
  accept,
  label,
  onFiles,
}: {
  accept: string;
  label: string;
  onFiles: (files: FileList) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  return (
    <div
      className="dropzone"
      data-active={active}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
    >
      {label}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function FontsSection() {
  const store = useStore();
  const { fonts } = store.project;
  const [error, setError] = useState<string | null>(null);
  useCustomFonts(fonts);

  const handleFiles = async (files: FileList) => {
    setError(null);
    for (const file of Array.from(files)) {
      if (!/\.(ttf|otf)$/i.test(file.name)) {
        setError(`${file.name} is not a .ttf or .otf file.`);
        continue;
      }
      const buffer = await file.arrayBuffer();
      store.addFont({
        id: uid('font'),
        fileName: file.name,
        identifier: toIdentifier(file.name, 'CUSTOM_FONT'),
        data: arrayBufferToBase64(buffer),
        characterRegex: '',
      });
    }
  };

  return (
    <>
      <div className="section-title">Custom fonts</div>
      {error && <div className="warning-bar">{error}</div>}
      <Dropzone
        accept=".ttf,.otf"
        label="Drop a .ttf / .otf here, or click to choose. TrueType gives the most reliable results on Pebble."
        onFiles={handleFiles}
      />
      <div style={{ height: 12 }} />

      {fonts.map((font) => {
        const usedSizes = [
          ...new Set(
            store.project.elements
              .filter((el) => 'font' in el && el.font.kind === 'custom' && el.font.fontId === font.id)
              .map((el) => ('font' in el && el.font.kind === 'custom' ? el.font.size : 0)),
          ),
        ].sort((a, b) => a - b);

        return (
          <div className="asset" key={font.id}>
            <div className="asset-head">
              <span className="asset-name" title={font.fileName}>
                {font.fileName}
              </span>
              <span className="asset-meta">{formatBytes(base64Bytes(font.data))}</span>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-danger"
                onClick={() => store.removeFont(font.id)}
                title="Remove font"
              >
                <CloseIcon />
              </button>
            </div>
            <div
              style={{
                fontFamily: `'${customFontFamily(font.id)}', sans-serif`,
                fontSize: 22,
                lineHeight: 1.25,
                padding: '4px 2px 10px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              12:45 Wed 08
            </div>
            <TextField
              label="Resource identifier stem"
              value={font.identifier}
              onChange={(value) => store.patchFont(font.id, { identifier: toIdentifier(value, 'CUSTOM_FONT') })}
              mono
              hint={
                <>
                  Each size becomes its own resource named{' '}
                  <code>{font.identifier}_&lt;size&gt;</code>.
                </>
              }
            />
            <TextField
              label="Character regex (optional)"
              value={font.characterRegex}
              onChange={(value) => store.patchFont(font.id, { characterRegex: value })}
              placeholder="[0-9:APM ]"
              mono
              hint="Limits which glyphs get built. Shrinks the app a lot for digit-only faces."
            />
            <div className="asset-meta">
              {usedSizes.length
                ? `Used at ${usedSizes.map((s) => `${s}px`).join(', ')} → resources ${usedSizes
                    .map((s) => `${font.identifier}_${s}`)
                    .join(', ')}`
                : 'Not used yet - pick it as an element font in the inspector.'}
            </div>
          </div>
        );
      })}
    </>
  );
}

function ImagesSection() {
  const store = useStore();
  const { images } = store.project;
  const [error, setError] = useState<string | null>(null);
  const colorMode = store.spec.colorMode;
  const mono = colorMode === 'bw';
  const naturalVariants = images.map((i) => ({
    assetId: i.id,
    size: { width: i.width, height: i.height },
  }));
  const renderedImages = useRenderedImages(images, naturalVariants, colorMode);

  const handleFiles = async (files: FileList) => {
    setError(null);
    for (const file of Array.from(files)) {
      if (!/\.png$/i.test(file.name)) {
        setError(`${file.name} is not a PNG. The Pebble resource pipeline expects PNG files.`);
        continue;
      }
      const buffer = await file.arrayBuffer();
      const data = arrayBufferToBase64(buffer);
      const size = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = `data:image/png;base64,${data}`;
      });
      store.addImage({
        id: uid('img'),
        fileName: file.name,
        identifier: toIdentifier(file.name, 'IMAGE'),
        data,
        width: size.width,
        height: size.height,
        hasAlpha: await detectAlpha(data),
      });
    }
  };

  return (
    <>
      <div className="section-title">Images</div>
      {error && <div className="warning-bar">{error}</div>}
      <Dropzone accept=".png" label="Drop PNG files here, or click to choose." onFiles={handleFiles} />
      <div style={{ height: 12 }} />

      {images.map((image) => (
        <div className="asset" key={image.id}>
          <div className="asset-head">
            <span className="asset-name" title={image.fileName}>
              {image.fileName}
            </span>
            <span className="asset-meta">
              {image.width}×{image.height} · {formatBytes(base64Bytes(image.data))}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost btn-danger"
              onClick={() => store.removeImage(image.id)}
              title="Remove image"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="asset-preview">
            <img
              src={`data:image/png;base64,${renderedImages.get(variantKey(image.id, { width: image.width, height: image.height })) ?? image.data}`}
              alt=""
              style={{ maxWidth: '100%', maxHeight: 110, imageRendering: 'pixelated' }}
            />
          </div>

          <Segmented
            label={mono ? 'Reduce to black & white' : `Reduce to ${store.spec.colorCount} colors`}
            value={reduceOptions(image, colorMode).mode}
            options={[
              { value: 'flat' as ReduceMode, label: mono ? 'Threshold' : 'Nearest' },
              { value: 'dither' as ReduceMode, label: 'Dither' },
            ]}
            onChange={(mode) =>
              store.patchImage(image.id, {
                reduce: { ...reduceOptions(image, colorMode), mode },
              })
            }
          />
          {mono && (
            <SliderField
              label="Cut-off"
              value={reduceOptions(image, colorMode).threshold}
              min={1}
              max={99}
              suffix="%"
              editable
              onChange={(threshold) =>
                store.patchImage(image.id, {
                  reduce: { ...reduceOptions(image, colorMode), threshold },
                })
              }
              hint={
                reduceOptions(image, colorMode).mode === 'dither'
                  ? 'Shifts the whole image lighter or darker before dithering.'
                  : 'Pixels brighter than this become white, the rest black.'
              }
            />
          )}
          <Segmented
            label="Drawing mode"
            value={compositingFor(image, colorMode)}
            options={[
              { value: 'assign' as Compositing, label: 'Opaque' },
              { value: 'set' as Compositing, label: 'Transparent' },
            ]}
            onChange={(compositing) => store.patchImage(image.id, { compositing })}
          />
          <div className="field-hint" style={{ marginTop: -6, marginBottom: 11 }}>
            {compositingFor(image, colorMode) === 'assign' ? (
              <>
                <code>GCompOpAssign</code> - draws every pixel, replacing what is underneath.
              </>
            ) : mono ? (
              <>
                <code>GCompOpSet</code> - on a 1-bit screen this paints white wherever the image is
                black and leaves everything else alone. Right for a transparent cut-out, wrong for a
                solid image, which is why the preview above changes.
              </>
            ) : (
              <>
                <code>GCompOpSet</code> - honors the PNG's transparency.
              </>
            )}
            {image.hasAlpha === false && compositingFor(image, colorMode) === 'set' && (
              <>
                {' '}
                This PNG has no transparent pixels, so <strong>Opaque</strong> is probably what you
                want.
              </>
            )}
          </div>
          <TextField
            label="Resource identifier"
            value={image.identifier}
            onChange={(value) => store.patchImage(image.id, { identifier: toIdentifier(value, 'IMAGE') })}
            mono
            hint={
              <>
                Referenced in code as <code>RESOURCE_ID_{image.identifier}</code>.
              </>
            }
          />
        </div>
      ))}
    </>
  );
}

export function AssetsPanel() {
  return (
    <div className="panel-scroll">
      <div className="callout">
        <strong className="callout-title">These can’t live in code</strong>
        Fonts and images are SDK <em>resources</em>. The export gives you the exact identifiers to
        type into CloudPebble’s Resources tab - see the setup guide in the export panel.
      </div>
      <FontsSection />
      <ImagesSection />
    </div>
  );
}
