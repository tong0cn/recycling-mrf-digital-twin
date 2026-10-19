import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/**
 * 程序化贴图库 —— 全部用 Canvas2D 在运行时画出来，不引入任何图片文件。
 *
 * 约定：
 * - 每个生成器都用固定种子的 mulberry32，同一台机器每次构建得到完全相同的图案；
 * - 结果按「族 + 重复次数」缓存，避免同一张贴图被重复绘制几十次；
 * - 取不到 2D 上下文时返回 null，材质自动退回纯色（jsdom / 老浏览器不会因此崩）。
 */

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, Texture | null>();

function create(size: number, key: string, repeatX: number, repeatY: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): Texture | null {
  const cacheKey = `${key}:${size}:${repeatX}:${repeatY}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
  let texture: Texture | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    draw(ctx, size);
    texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = 4;
  } catch {
    texture = null;
  }
  cache.set(cacheKey, texture);
  return texture;
}

/** 在画布上撒噪点，做出水泥/橡胶这类颗粒面。 */
function speckle(ctx: CanvasRenderingContext2D, size: number, random: () => number, count: number, alpha: number, spread: number) {
  for (let index = 0; index < count; index += 1) {
    const value = Math.round(128 + (random() - 0.5) * spread);
    ctx.fillStyle = `rgba(${value},${value},${value},${alpha})`;
    ctx.fillRect(random() * size, random() * size, 1 + random() * 1.6, 1 + random() * 1.6);
  }
}

/** 摊铺出来的软斑：油渍、水痕、修补。 */
function blotches(ctx: CanvasRenderingContext2D, size: number, random: () => number, count: number, color: string, maxRadius: number, alpha: number) {
  for (let index = 0; index < count; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = size * 0.02 + random() * maxRadius;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.4 + random() * 0.6);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 混凝土地坪：颗粒 + 油渍 + 一道伸缩缝。 */
export function concreteFloor(repeatX = 10, repeatY = 7): Texture | null {
  return create(512, 'concrete', repeatX, repeatY, (ctx, size) => {
    const random = rng(20261016);
    ctx.fillStyle = '#a9b0b4';
    ctx.fillRect(0, 0, size, size);
    // 大块色差，避免整片死平（对比度比早期版本高一档，俯瞰距离下也能看见地坪的脏与旧）
    for (let index = 0; index < 26; index += 1) {
      const shade = 132 + Math.round(random() * 62);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 5})`;
      const w = size * (0.15 + random() * 0.5);
      const h = size * (0.15 + random() * 0.5);
      ctx.fillRect(random() * size, random() * size, w, h);
    }
    ctx.globalAlpha = 1;
    speckle(ctx, size, random, 9000, 0.22, 120);
    blotches(ctx, size, random, 10, 'rgba(96,104,108,1)', size * 0.08, 0.34);
    blotches(ctx, size, random, 5, 'rgba(70,76,80,1)', size * 0.05, 0.26);
    // 大尺度油渍与磨损：俯瞰全厂时只有米级色斑还看得见，粒噪点会被 mipmap 抹平
    blotches(ctx, size, random, 6, 'rgba(58,64,68,1)', size * 0.5, 0.2);
    blotches(ctx, size, random, 4, 'rgba(206,211,214,1)', size * 0.45, 0.16);
    // 伸缩缝
    ctx.strokeStyle = 'rgba(88,96,100,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, 0);
    ctx.lineTo(size * 0.5, size);
    ctx.moveTo(0, size * 0.5);
    ctx.lineTo(size, size * 0.5);
    ctx.stroke();
  });
}

/** 环氧通道：比混凝土地坪细腻，带一点反光斑。 */
export function epoxyFloor(repeatX = 12, repeatY = 2): Texture | null {
  return create(512, 'epoxy', repeatX, repeatY, (ctx, size) => {
    const random = rng(991117);
    ctx.fillStyle = '#9aa6ad';
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, random, 14, 'rgba(120,134,142,1)', size * 0.09, 0.3);
    speckle(ctx, size, random, 4200, 0.1, 60);
    // 防滑颗粒带
    ctx.globalAlpha = 0.12;
    for (let index = 0; index < 900; index += 1) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(random() * size, random() * size, 2, 2);
    }
    ctx.globalAlpha = 1;
  });
}

/** 彩钢瓦墙板：竖向肋 + 螺丝点 + 轻微锈迹。 */
export function corrugatedPanel(repeatX = 20, repeatY = 2): Texture | null {
  return create(512, 'corrugated', repeatX, repeatY, (ctx, size) => {
    const random = rng(4242);
    ctx.fillStyle = '#c9d1d6';
    ctx.fillRect(0, 0, size, size);
    const rib = size / 16;
    for (let index = 0; index < 16; index += 1) {
      const x = index * rib;
      const grad = ctx.createLinearGradient(x, 0, x + rib, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.06)');
      grad.addColorStop(0.55, 'rgba(120,130,136,0.22)');
      grad.addColorStop(1, 'rgba(150,160,166,0.12)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, rib, size);
    }
    // 螺丝点
    for (let row = 0; row < 2; row += 1) {
      for (let index = 0; index < 16; index += 1) {
        const x = index * rib + rib / 2;
        const y = size * (row === 0 ? 0.12 : 0.88);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(120,130,136,0.85)';
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = 'rgba(240,246,250,0.7)';
        ctx.arc(x - 0.8, y - 0.8, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    blotches(ctx, size, random, 6, 'rgba(120,96,74,1)', size * 0.03, 0.12);
  });
}

/** 橡胶皮带：细颗粒 + 一道横向挡条。 */
export function rubberBelt(repeatX = 1, repeatY = 24): Texture | null {
  return create(256, 'belt', repeatX, repeatY, (ctx, size) => {
    const random = rng(777001);
    ctx.fillStyle = '#3d454a';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, random, 5200, 0.22, 120);
    ctx.fillStyle = 'rgba(24,28,31,0.85)';
    ctx.fillRect(0, size * 0.46, size, size * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, size * 0.52, size, size * 0.03);
  });
}

/** 瓦楞纸板：牛卡色 + 瓦楞横纹 + 胶带。 */
export function cardboard(repeatX = 2, repeatY = 2): Texture | null {
  return create(256, 'cardboard', repeatX, repeatY, (ctx, size) => {
    const random = rng(515151);
    ctx.fillStyle = '#bb8f56';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 5) {
      ctx.fillStyle = y % 10 === 0 ? 'rgba(150,110,66,0.5)' : 'rgba(210,170,120,0.35)';
      ctx.fillRect(0, y, size, 2);
    }
    blotches(ctx, size, random, 8, 'rgba(140,104,62,1)', size * 0.06, 0.22);
    speckle(ctx, size, random, 1600, 0.1, 50);
  });
}

/** 木托盘：纵纹 + 节疤。 */
export function woodBoard(repeatX = 1, repeatY = 1): Texture | null {
  return create(256, 'wood', repeatX, repeatY, (ctx, size) => {
    const random = rng(313131);
    ctx.fillStyle = '#c2a172';
    ctx.fillRect(0, 0, size, size);
    for (let index = 0; index < 90; index += 1) {
      const y = random() * size;
      ctx.strokeStyle = `rgba(${120 + random() * 40},${94 + random() * 30},${60 + random() * 20},${0.25 + random() * 0.3})`;
      ctx.lineWidth = 0.6 + random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + (random() - 0.5) * 8, size * 0.7, y + (random() - 0.5) * 8, size, y);
      ctx.stroke();
    }
    for (let index = 0; index < 3; index += 1) {
      const x = random() * size;
      const y = random() * size;
      ctx.fillStyle = 'rgba(120,90,58,0.5)';
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + random() * 4, 3 + random() * 3, random(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** 警示斜纹：黄黑 45°。 */
export function hazardStripe(repeatX = 6, repeatY = 1): Texture | null {
  return create(128, 'hazard', repeatX, repeatY, (ctx, size) => {
    ctx.fillStyle = '#e5b53a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#2b3134';
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 4);
    for (let x = -size; x < size; x += size / 4) {
      ctx.fillRect(x, -size, size / 8, size * 2);
    }
    ctx.restore();
  });
}

/**
 * 文字贴花：地面分区名、月台编号、设备铭牌都用它。
 * 字体走系统栈（不加载任何在线字体），所以离线下也能画出中文。
 */
export function textDecal(text: string, options: { color?: string; background?: string; fontScale?: number; ratio?: number } = {}): Texture | null {
  const { color = '#3d474d', background = 'transparent', fontScale = 0.42, ratio = 4 } = options;
  const height = 128;
  const width = Math.round(height * ratio);
  const cacheKey = `text:${text}:${color}:${background}:${fontScale}:${ratio}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
  let texture: Texture | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    if (background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = Math.round(height * fontScale);
    ctx.font = `600 ${fontSize}px "Microsoft YaHei","PingFang SC",system-ui,sans-serif`;
    ctx.fillText(text, width / 2, height / 2 + 2);
    texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
  } catch {
    texture = null;
  }
  cache.set(cacheKey, texture);
  return texture;
}
