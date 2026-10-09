export const houseProfile = (id, height, reference) => {
  // Based on the local qwen3-coder candidate; validation and mixing corrected
  // after review. Evidence: artifacts/local-agent/house-generator/profile-repair-*.
  if ((typeof id !== 'string' && typeof id !== 'number') || (typeof id === 'number' && !Number.isFinite(id))) return null;
  const idStr = String(id);
  if (!idStr.trim()) return null;
  if (typeof height !== 'number' || height <= 0 || !Number.isFinite(height)) return null;
  if (!reference || typeof reference !== 'object') return null;
  if (typeof reference.id !== 'string' || !reference.id.trim()) return null;
  if (!Array.isArray(reference.wall) || reference.wall.length !== 3) return null;
  if (!Array.isArray(reference.trim) || reference.trim.length !== 3) return null;
  if (!Array.isArray(reference.roof) || reference.roof.length !== 3) return null;

  const validateRGB = (rgb) => {
    for (let i = 0; i < 3; i++) {
      if (typeof rgb[i] !== 'number' || !Number.isFinite(rgb[i]) || rgb[i] < 0 || rgb[i] > 1) return false;
    }
    return true;
  };

  if (!validateRGB(reference.wall) || !validateRGB(reference.trim) || !validateRGB(reference.roof)) return null;

  const hash = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    return h >>> 0;
  };

  const seed = hash(idStr);
  const rng = (s) => {
    let x = s | 0;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
    return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
  };

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const vary = (c, range = 0.035) => clamp(c + (rng(seed + c * 1000) - 0.5) * range * 2, 0, 1);

  const wall = reference.wall.map(c => vary(c));
  const trim = reference.trim.map(c => vary(c));
  const roof = reference.roof.map(c => vary(c));

  const doorColors = [
    [0.09, 0.16, 0.22],
    [0.13, 0.21, 0.17],
    [0.26, 0.17, 0.12]
  ];
  const door = doorColors[seed % 3];

  const floors = Math.max(1, Math.min(6, Math.floor(height / 2.4)));
  const windowHeight = Math.max(0.01, Math.min(height*.5, height / floors - 0.9, 1.4 + rng(seed + 4)*.4));
  const windowWidth = 0.7 + rng(seed + 1) * 0.4;
  const baySpacing = 1.8 + rng(seed + 2) * 1.0;
  const corniceDepth = 0.1 + rng(seed + 3) * 0.15;

  return {
    seed,
    referenceId: reference.id,
    wall,
    trim,
    roof,
    door,
    floors,
    windowWidth,
    windowHeight,
    baySpacing,
    corniceDepth
  };
};
