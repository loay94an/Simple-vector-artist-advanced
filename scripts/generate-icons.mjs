import fs from 'node:fs';
import { PNG } from 'pngjs';

function inside(x, y, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if (((a[1] > y) !== (b[1] > y)) &&
        x < (b[0] - a[0]) * (y - a[1]) /
        (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

function distSegment(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1,
    ((x-a[0])*dx + (y-a[1])*dy) / (dx*dx+dy*dy)));
  return Math.hypot(x-a[0]-t*dx, y-a[1]-t*dy);
}

function makeIcon(size) {
  const scale = 2;
  const W = size * scale;
  const png = new PNG({width: W, height: W});
  const S = 512 / W;

  const pen = [[150,315],[305,160],[355,210],[200,365]];
  const nib = [[150,315],[200,365],[112,390]];
  const cut = [[302,205],[327,230],[218,339],[193,314]];

  const curve = [];
  for (let i=0; i<=45; i++) {
    const t=i/45, u=1-t;
    curve.push([
      u*u*u*80+3*u*u*t*180+3*u*t*t*330+t*t*t*430,
      u*u*u*390+3*u*u*t*250+3*u*t*t*430+t*t*t*170
    ]);
  }

  for (let py=0; py<W; py++) {
    for (let px=0; px<W; px++) {
      const x=(px+0.5)*S, y=(py+0.5)*S;
      const idx=(py*W+px)*4;

      const dx=Math.max(92-x,0,x-420);
      const dy=Math.max(92-y,0,y-420);
      const outside=Math.hypot(dx,dy) > 0 ||
        (x<92 && y<92 && Math.hypot(x-92,y-92)>0) ||
        (x>420 && y<92 && Math.hypot(x-420,y-92)>0) ||
        (x<92 && y>420 && Math.hypot(x-92,y-420)>0) ||
        (x>420 && y>420 && Math.hypot(x-420,y-420)>0);

      if (outside) continue;

      const g=Math.max(0,Math.min(1,(x+y)/1024));
      let r=Math.round(37*(1-g)+124*g);
      let green=Math.round(99*(1-g)+58*g);
      let b=Math.round(235*(1-g)+237*g);

      let white=false;

      // Bezier vector path
      for(let i=1;i<curve.length;i++) {
        if(distSegment(x,y,curve[i-1],curve[i])<7) {
          white=true; break;
        }
      }

      // Control points
      for(const [cx,cy] of [[80,390],[430,170]]) {
        if(Math.hypot(x-cx,y-cy)<12) white=true;
      }

      // Pen body and nib
      if(inside(x,y,pen) || inside(x,y,nib)) white=true;

      if(white) { r=255; green=255; b=255; }

      // Dark detail in the pen
      if(inside(x,y,cut)) {
        r=Math.round(20*(1-g)+65*g);
        green=Math.round(65*(1-g)+35*g);
        b=190;
      }

      png.data[idx]=r;
      png.data[idx+1]=green;
      png.data[idx+2]=b;
      png.data[idx+3]=255;
    }
  }

  // Downsample 2x for smooth edges
  const out = new PNG({width:size,height:size});
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const oi=(y*size+x)*4;
    for(let c=0;c<4;c++) {
      let sum=0;
      for(let sy=0;sy<2;sy++) for(let sx=0;sx<2;sx++) {
        sum+=png.data[(((y*2+sy)*W)+(x*2+sx))*4+c];
      }
      out.data[oi+c]=Math.round(sum/4);
    }
  }
  return PNG.sync.write(out);
}

fs.mkdirSync('icons',{recursive:true});
fs.mkdirSync('public/icons',{recursive:true});

for(const size of [192,512]) {
  const data=makeIcon(size);
  fs.writeFileSync(`icons/icon-${size}.png`,data);
  fs.writeFileSync(`public/icons/icon-${size}.png`,data);
  console.log(`Generated ${size}x${size} icon`);
}
