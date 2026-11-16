import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/** Pointer-based signature canvas (mouse, pen and touch). Exposes clear(), isEmpty() and toDataURL(). */
const SignaturePad = forwardRef(function SignaturePad({ label = 'Signature area', onChange }, ref) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const setup = () => {
    const c = canvas.current;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = width * ratio;
    c.height = height * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1d44';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    setEmpty(true);
    onChange?.(true);
  };

  useEffect(() => { setup(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    clear: setup,
    isEmpty: () => empty,
    toDataURL: () => canvas.current.toDataURL('image/png'),
  }));

  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    e.preventDefault();
    canvas.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current.getContext('2d');
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvas.current.getContext('2d');
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (empty) { setEmpty(false); onChange?.(false); }
  };
  const up = () => { drawing.current = false; };

  return (
    <canvas
      ref={canvas}
      className="sigpad"
      aria-label={label}
      role="img"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={up}
    />
  );
});

export default SignaturePad;
