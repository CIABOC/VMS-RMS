/**
 * The CIABOC wordmark: spaced capitals with the red dot as the "O".
 * Scales with font-size, so `size` is the cap height in pixels.
 */
export default function Wordmark({ size = 24, className = '' }) {
  return (
    <span className={`wordmark ${className}`} style={{ fontSize: size }} role="img" aria-label="CIABOC">
      <span aria-hidden="true">CIAB</span>
      <span className="wordmark-dot" aria-hidden="true" />
      <span aria-hidden="true">C</span>
    </span>
  );
}
