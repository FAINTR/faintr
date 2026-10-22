// Bounded PNG renderer using pre-rendered Inter (OFL) glyphs. No image service or storage.
import fonts from './share-fonts.json';
const W=1200,H=630, colors={bg:'#20232C',panel:'#2B2F3A',line:'#474D5B',white:'#F2F4F7',muted:'#B4BDCD',red:'#D7263D',amber:'#F5B800'};
const rgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const masks=new Map();
export async function renderCard(card) {
  // Indexed pixels and native fills keep per-image work small on Cloudflare's free tier.
  const pixels=new Uint8Array(W*H),palette=[],indices=new Map(),shades=new Map();
  function colorIndex(color){if(!indices.has(color)){indices.set(color,palette.length/3);palette.push(...rgb(color));}return indices.get(color);}
  Object.values(colors).forEach(colorIndex);
  function rect(x,y,w,h,color){x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);const index=colorIndex(color);for(let j=Math.max(0,y);j<Math.min(H,y+h);j++)pixels.fill(index,j*W+Math.max(0,x),j*W+Math.min(W,x+w));}
  function shadeTable(color,bg){const key=color+bg;if(!shades.has(key)){const f=rgb(color),b=rgb(bg),table=[];for(let q=0;q<16;q++){const hex='#'+f.map((v,k)=>Math.round((v*q+b[k]*(15-q))/15).toString(16).padStart(2,'0')).join('');table.push(colorIndex(hex));}shades.set(key,table);}return shades.get(key);}
  function width(s,font){return [...s].reduce((n,ch)=>n+(fonts[font][ch]||fonts[font]['?'])[0],0);}
  function text(s,x,y,font='body',color=colors.white,max=1100){
    const table=shadeTable(color,card.members&&y>=166&&y<488?colors.panel:colors.bg);s=String(s);
    while(width(s,font)>max && s.length>1) s=s.slice(0,-2)+'…';
    for(const ch of s){const glyph=fonts[font][ch]||fonts[font]['?'];const [w,h,b64]=glyph;
      if(!masks.has(b64))masks.set(b64,Uint8Array.from(atob(b64),v=>v.charCodeAt(0)));
      const a=masks.get(b64);
      for(let j=0;j<h && y+j<H;j++)for(let i=0;i<w && x+i<W;i++){const alpha=a[j*w+i];if(alpha)pixels[(y+j)*W+x+i]=table[Math.min(15,(alpha+8)>>4)];}
      x+=w;
    }
  }
  function wrap(s,max,font){const lines=[''];for(const word of String(s).split(' ')){let i=lines.length-1;if(lines[i] && width(lines[i]+' '+word,font)>max)lines.push(word);else lines[i]+=(lines[i]?' ':'')+word;}return lines;}
  rect(0,0,W,H,colors.bg);rect(0,0,10,H,colors.red);
  // The existing FAINTR shield mark, from ui/index.html, with its original offsets.
  function polygon(points,color){const ys=points.map(p=>p[1]);for(let y=Math.floor(Math.min(...ys));y<=Math.ceil(Math.max(...ys));y++){const hits=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))hits.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}hits.sort((a,b)=>a-b);for(let i=0;i<hits.length;i+=2)rect(Math.ceil(hits[i]),y,Math.floor(hits[i+1])-Math.ceil(hits[i])+1,1,color);}}
  function shield(left){const x=left?70:190,points=[[130,50],[x,68],[x,122]];for(let i=1;i<=30;i++){const t=i/30,u=1-t;points.push([u*u*u*x+3*u*u*t*x+3*u*t*t*(left?100:160)+t*t*t*130,u*u*u*122+3*u*u*t*165+3*u*t*t*192+t*t*t*208]);}polygon(points.map(([x,y])=>[46+(x-60+(left?-2:2))*.5,28+(y-40+(left?4:0))*.5]),left?colors.red:'#8A93A3');}
  shield(true);shield(false);
  polygon([[108,88],[157,88],[157,102],[123,102],[123,116],[149,116],[149,130],[123,130],[123,155],[108,155]].map(([x,y])=>[46+(x-60)*.5,28+(y-40)*.5]),colors.white);
  rect(46+(137-60)*.5,28+(141-40)*.5,10,7,colors.amber);
  text('FAINT',130,25,'brand',colors.red);text('R',130+width('FAINT','brand'),25,'brand');
  text('Win the matchup.',133,99,'small',colors.muted);
  text(card.format||'Pokemon GO PvP',660,41,'name',colors.white,490);
  text(card.members?'SHARED TEAM':'FREE PVP TEAM TOOLS',660,94,'small',colors.muted,490);
  const roles=['LEAD','SAFE SWAP','CLOSER'];
  if(card.members)card.members.forEach((m,k)=>{
    const x=46+k*378;
    rect(x,166,352,322,colors.panel);rect(x,166,352,4,k===0?colors.red:colors.line);
    text(roles[k],x+22,183,'small',colors.amber,308);
    const lines=wrap(m.name,306,'name');lines.slice(0,2).forEach((s,i)=>text(s,x+22,222+i*39,'name',colors.white,306));
    text((m.types||[]).join(' / ').toUpperCase(),x+22,311,'small',colors.muted,306);
    rect(x+22,352,306,1,colors.line);
    (m.moves||[]).forEach((s,i)=>text(s,x+22,363+i*30,'body',colors.white,306));
    text(m.ivs?`IVs ${m.ivs.atk} / ${m.ivs.def} / ${m.ivs.hp}  |  Max ${m.levelCap}`:'PvPoke default IVs',x+22,457,'small',colors.muted,306);
  });
  else {text('Find your next team.',46,205,'title');text('Check weaknesses. Test matchups. Use your own IVs.',46,287,'body',colors.muted);text('Free tools for Pokemon GO players.',46,347,'body');}
  rect(46,526,1108,1,colors.line);
  text(card.members?'Open this team. Try a replacement.':'Build teams. Grade teams. Check matchups.',46,550,'body');
  text('FAINTR.com',935,549,'body',colors.amber,225);
  text('Built on PvPoke. Simulations are not a guarantee of battle results.',46,595,'small',colors.muted);
  const raw=new Uint8Array(H*(W+1));
  for(let y=0;y<H;y++)raw.set(pixels.subarray(y*W,(y+1)*W),y*(W+1)+1);
  const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c;}
  function chunk(type,data){const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);let c=0xffffffff;for(let i=4;i<out.length-4;i++)c=crcTable[(c^out[i])&255]^(c>>>8);v.setUint32(out.length-4,(c^0xffffffff)>>>0);return out;}
  const ihdr=new Uint8Array(13),v=new DataView(ihdr.buffer);v.setUint32(0,W);v.setUint32(4,H);ihdr[8]=8;ihdr[9]=3;
  if(palette.length>768)throw Error('Image palette exceeded.');
  return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('PLTE',new Uint8Array(palette)),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]);
}
