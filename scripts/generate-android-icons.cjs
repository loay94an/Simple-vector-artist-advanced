const fs = require('fs');
const { PNG } = require('pngjs');

const source = PNG.sync.read(
  fs.readFileSync('icons/icon-512.png')
);

function resize(source, width, height, scale = 1) {
  const out = new PNG({ width, height });
  const drawSize = Math.round(width * scale);
  const offset = Math.floor((width - drawSize) / 2);

  for (let y = 0; y < drawSize; y++) {
    for (let x = 0; x < drawSize; x++) {
      const sx = Math.min(511, Math.floor(x * 512 / drawSize));
      const sy = Math.min(511, Math.floor(y * 512 / drawSize));

      const si = (sy * 512 + sx) * 4;
      const di = ((y + offset) * width + x + offset) * 4;

      for (let c = 0; c < 4; c++) {
        out.data[di + c] = source.data[si + c];
      }
    }
  }
  return out;
}

const densities = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192
};

for (const [density, size] of Object.entries(densities)) {
  const dir = `android/app/src/main/res/mipmap-${density}`;
  fs.mkdirSync(dir, { recursive: true });

  const icon = resize(source, size, size);
  const foreground = resize(source, size * 2.25, size * 2.25, 0.66);

  fs.writeFileSync(`${dir}/ic_launcher.png`, PNG.sync.write(icon));
  fs.writeFileSync(`${dir}/ic_launcher_round.png`, PNG.sync.write(icon));
  fs.writeFileSync(
    `${dir}/ic_launcher_foreground.png`,
    PNG.sync.write(foreground)
  );

  console.log('Generated:', density);
}

console.log('Android icons generated from approved icon.');
