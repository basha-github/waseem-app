/* ============================================================
   Colour swatch SVG generator
   Produces a self-contained <svg> string for any colour in the
   ITEMS list — a glossy orb, centered in a 0-100 viewBox.
   Mirrors the look of the canvas-drawn learning app.
   ============================================================ */

const COLOR_VALUES = {
  red:       '#FF3B30',
  orange:    '#FF9500',
  yellow:    '#FFD60A',
  green:     '#34C759',
  blue:      '#0A84FF',
  purple:    '#AF52DE',
  pink:      '#FF2D78',
  brown:     '#8B5E3C',
  black:     '#1C1C1E',
  white:     '#FFFFFF',
  gray:      '#8E8E93',
  turquoise: '#2EC4B6'
};

function hexBrightness(hex){
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return (r + g + b) / 3;
}

function colorSwatchSVG(colorKey){
  const hex = COLOR_VALUES[colorKey] || '#FF6B5B';
  const needsBorder = hexBrightness(hex) > 235;
  const border = needsBorder ? `<circle cx="50" cy="50" r="33" fill="none" stroke="#2E1A47" stroke-width="3.5"/>` : '';

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="32" fill="${hex}"/>
    ${border}
    <ellipse cx="41" cy="38" rx="16" ry="11" fill="#FFFFFF" opacity="0.27"/>
    <ellipse cx="53" cy="55" rx="22" ry="17" fill="#FFFFFF" opacity="0.12"/>
  </svg>`;
}
