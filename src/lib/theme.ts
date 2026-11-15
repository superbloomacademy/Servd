// Turns a vendor's single brand color into the CSS variables the UI uses,
// making sure text on the brand color and brand-colored text stay readable.
function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0xe23744;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum([r, g, b]: number[]) {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const toHex = (rgb: number[]) => '#' + rgb.map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

export function brandVars(color: string | null | undefined): React.CSSProperties {
  const rgb = hexToRgb(color || '#E23744');
  const L = lum(rgb);
  const ink = contrast(L, 1) >= contrast(L, 0) ? '#ffffff' : '#1C1C1C';
  // Darken the brand until it reads on white (4.5:1) for brand-colored text.
  let t = rgb.slice();
  for (let i = 0; i < 12 && contrast(lum(t), 1) < 4.5; i++) t = t.map(c => c * 0.88);
  return { ['--brand' as string]: toHex(rgb), ['--brand-ink' as string]: ink, ['--brand-text' as string]: toHex(t) } as React.CSSProperties;
}
