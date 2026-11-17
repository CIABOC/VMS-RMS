import { useState } from 'react';

/**
 * The national crest used on CIABOC pages. The image lives in /public/brand/crest.png -
 * replace that file with the official high-resolution, transparent PNG (same name) and every
 * screen picks it up. Decorative by default (empty alt); pass `label` when it stands alone.
 */
export default function Crest({ size = 40, label }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="crest-fallback" style={{ width: size * 0.78, height: size }} aria-hidden={!label} title={label} />;
  }
  return (
    <img
      src="/brand/crest.png"
      alt={label || ''}
      height={size}
      style={{ height: size, width: 'auto', display: 'block' }}
      onError={() => setFailed(true)}
    />
  );
}
