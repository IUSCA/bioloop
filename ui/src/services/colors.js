// https://dev.to/admitkard/auto-generate-avatar-colors-randomly-138j
// https://www.30secondsofcode.org/js/s/hsl-to-rgb/

function getHashOfString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  return hash;
}

function normalizeHash(hash, min, max) {
  return Math.floor((hash % (max - min)) + min);
}

function generateHSL(hash) {
  const hRange = [0, 360];
  const sRange = [50, 75];
  const lRange = [25, 60];
  const h = normalizeHash(hash, hRange[0], hRange[1]);
  const s = normalizeHash(hash, sRange[0], sRange[1]);
  const l = normalizeHash(hash, lRange[0], lRange[1]);
  return [h, s, l];
}

const HSLToRGB = (h, s, l) => {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [
    Math.floor(255 * f(0)),
    Math.floor(255 * f(8)),
    Math.floor(255 * f(4)),
  ];
};

function RGBToHex(r, g, b) {
  return `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`;
}

function HSLtoString(hsl) {
  return `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`;
}

function stringToHSL(name) {
  const hash = getHashOfString(name);
  const hsl = generateHSL(hash);
  return HSLtoString(hsl);
}

function stringToRGB(name) {
  const hash = getHashOfString(name);
  const hsl = generateHSL(hash);
  const rgb = HSLToRGB(...hsl);
  return RGBToHex(...rgb);
}

export { stringToHSL, stringToRGB };
