/* ============================================================
   Shape SVG generator
   Produces a self-contained <svg> string for any shape in the
   ITEMS list, centered in a 0-100 viewBox. Mirrors the geometry
   used by the canvas-drawn learning app for visual consistency.
   ============================================================ */

function polygonPoints(cx, cy, r, n, startAngle){
  const pts = [];
  for (let i = 0; i < n; i++){
    const a = startAngle + i * (Math.PI * 2 / n);
    pts.push((cx + Math.cos(a) * r).toFixed(2) + ',' + (cy + Math.sin(a) * r).toFixed(2));
  }
  return pts.join(' ');
}

function starPoints(cx, cy, r1, r2, npoints){
  const pts = [];
  const angle = Math.PI * 2 / npoints;
  const half = angle / 2;
  for (let a = -Math.PI/2; a < Math.PI*2 - Math.PI/2; a += angle){
    pts.push((cx + Math.cos(a)*r1).toFixed(2) + ',' + (cy + Math.sin(a)*r1).toFixed(2));
    pts.push((cx + Math.cos(a+half)*r2).toFixed(2) + ',' + (cy + Math.sin(a+half)*r2).toFixed(2));
  }
  return pts.join(' ');
}

function heartPoints(cx, cy, size){
  const s = size / 32;
  const pts = [];
  for (let t = 0; t <= Math.PI*2 + 0.01; t += 0.12){
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = -(13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t));
    pts.push((cx + hx*s).toFixed(2) + ',' + (cy + hy*s*0.92 - size*0.06).toFixed(2));
  }
  return pts.join(' ');
}

function crescentPoints(cx, cy, size){
  const R = size*0.5, r = size*0.44, d = size*0.28;
  const a = (R*R - r*r + d*d) / (2*d);
  const h = Math.sqrt(Math.max(0, R*R - a*a));
  const ix = -a;
  const outerAngle = Math.atan2(h, ix);
  const innerAngle = Math.atan2(h, ix + d);
  const pts = [];
  for (let t = -outerAngle; t <= outerAngle + 0.0001; t += 0.1){
    pts.push((cx + Math.cos(t)*R).toFixed(2) + ',' + (cy + Math.sin(t)*R).toFixed(2));
  }
  for (let t = innerAngle; t >= -innerAngle - 0.0001; t -= 0.1){
    pts.push((cx - d + Math.cos(t)*r).toFixed(2) + ',' + (cy + Math.sin(t)*r).toFixed(2));
  }
  return pts.join(' ');
}

function trapezoidPoints(cx, cy, size){
  return [
    [cx-size*0.55, cy+size*0.32],
    [cx+size*0.55, cy+size*0.32],
    [cx+size*0.3,  cy-size*0.32],
    [cx-size*0.3,  cy-size*0.32]
  ].map(p => p[0].toFixed(2)+','+p[1].toFixed(2)).join(' ');
}

function arrowPoints(cx, cy, size){
  const w = size*1.05, h = size*0.6;
  return [
    [cx-w*0.5, cy-h*0.2],
    [cx+w*0.08, cy-h*0.2],
    [cx+w*0.08, cy-h*0.42],
    [cx+w*0.5, cy],
    [cx+w*0.08, cy+h*0.42],
    [cx+w*0.08, cy+h*0.2],
    [cx-w*0.5, cy+h*0.2]
  ].map(p => p[0].toFixed(2)+','+p[1].toFixed(2)).join(' ');
}

/* ---------- main entry point ---------- */
function shapeInnerMarkup(name, color){
  const cx = 50, cy = 50;
  switch (name){
    case 'circle':
      return `<circle cx="${cx}" cy="${cy}" r="32" fill="${color}"/>`;
    case 'square':
      return `<rect x="22" y="22" width="56" height="56" rx="6" fill="${color}"/>`;
    case 'rectangle':
      return `<rect x="14" y="27" width="72" height="46" rx="5" fill="${color}"/>`;
    case 'oval':
      return `<ellipse cx="${cx}" cy="${cy}" rx="38" ry="24" fill="${color}"/>`;
    case 'triangle':
      return `<polygon points="${polygonPoints(cx,cy,34,3,-Math.PI/2)}" fill="${color}"/>`;
    case 'diamond':
      return `<polygon points="${polygonPoints(cx,cy,33,4,-Math.PI/2)}" fill="${color}"/>`;
    case 'pentagon':
      return `<polygon points="${polygonPoints(cx,cy,33,5,-Math.PI/2)}" fill="${color}"/>`;
    case 'hexagon':
      return `<polygon points="${polygonPoints(cx,cy,33,6,-Math.PI/6)}" fill="${color}"/>`;
    case 'octagon':
      return `<polygon points="${polygonPoints(cx,cy,33,8,-Math.PI/2+Math.PI/8)}" fill="${color}"/>`;
    case 'star':
      return `<polygon points="${starPoints(cx,cy,34,15,5)}" fill="${color}"/>`;
    case 'heart':
      return `<polygon points="${heartPoints(cx,cy,62)}" fill="${color}"/>`;
    case 'trapezoid':
      return `<polygon points="${trapezoidPoints(cx,cy,62)}" fill="${color}"/>`;
    case 'crescent':
      return `<polygon points="${crescentPoints(cx,cy,62)}" fill="${color}"/>`;
    case 'arrow':
      return `<polygon points="${arrowPoints(cx,cy,62)}" fill="${color}"/>`;
    default:
      return `<circle cx="${cx}" cy="${cy}" r="32" fill="${color}"/>`;
  }
}

function shapeSVG(name, color){
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${shapeInnerMarkup(name, color)}</svg>`;
}
