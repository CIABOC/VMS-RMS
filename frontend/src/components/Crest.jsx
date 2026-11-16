import { useId } from 'react';

/**
 * Placeholder crest - replace with the official CIABOC mark before go-live.
 * useId() gives every instance its own gradient id, so several crests on one page never clash.
 * Decorative by default (aria-hidden); pass `label` when it stands alone.
 */
export default function Crest({ size = 40, label }) {
  const gid = `crest-${useId().replace(/:/g, '')}`;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: 'false' };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F0DDA4" />
          <stop offset=".5" stopColor="#C9A24C" />
          <stop offset="1" stopColor="#8C6A24" />
        </linearGradient>
      </defs>
      <path d="M24 3 6 9v13c0 11 7.6 19.4 18 23 10.4-3.6 18-12 18-23V9z" fill="none" stroke={`url(#${gid})`} strokeWidth="2" />
      <path d="M24 8 10.5 12.6v9.6c0 8.4 5.6 14.8 13.5 17.7 7.9-2.9 13.5-9.3 13.5-17.7v-9.6z" fill="#0F2552" stroke="#C9A24C" strokeWidth=".7" opacity=".95" />
      <path d="M29.5 19.5a7 7 0 1 0 0 9" fill="none" stroke={`url(#${gid})`} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 33c2 2 4 3 6.5 3.6M34 33c-2 2-4 3-6.5 3.6" stroke="#C9A24C" strokeWidth="1" fill="none" />
    </svg>
  );
}
