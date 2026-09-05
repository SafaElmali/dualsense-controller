// Procedural artwork: the arena and effects are drawn locally, with no image assets.
export class RangeRenderer {
  constructor() { this.background = null; this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; }
  static viewport(width, height) {
    const scale = Math.min(width / 1000, height / 560);
    return { scale, x: (width - 1000 * scale) / 2, y: (height - 560 * scale) / 2 };
  }
  static point(rect, x, y) {
    const viewport = this.viewport(rect.width, rect.height);
    if (!viewport.scale) return null;
    const point = { x: (x - rect.left - viewport.x) / viewport.scale, y: (y - rect.top - viewport.y) / viewport.scale };
    return point.x >= 0 && point.x <= 1000 && point.y >= 0 && point.y <= 560 ? point : null;
  }
  backdrop() {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 896;
    const c = canvas.getContext('2d'); c.scale(1.6, 1.6);
    const polygon = (points, fill, stroke) => { c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); if(fill) {c.fillStyle=fill;c.fill();} if(stroke) {c.strokeStyle=stroke;c.stroke();} };
    const wall = c.createLinearGradient(0, 0, 0, 560); wall.addColorStop(0, '#0d1c22'); wall.addColorStop(.65, '#14242b'); wall.addColorStop(1, '#061015'); c.fillStyle = wall; c.fillRect(0,0,1000,560);
    polygon([[0,0],[150,95],[150,365],[0,560]],'#091419','#263d4260');
    polygon([[1000,0],[850,95],[850,365],[1000,560]],'#091419','#263d4260');
    polygon([[0,0],[1000,0],[850,95],[150,95]],'#0a151a','#263d4260');
    polygon([[0,560],[150,365],[850,365],[1000,560]],'#0a141a','#4e6f7225');
    // Recessed acoustic panels and structural ribs on the far wall.
    for (let x=156;x<850;x+=58) {
      c.fillStyle='#071115';c.fillRect(x,96,51,265);c.strokeStyle='#3c575d2b';c.strokeRect(x+.5,96.5,51,265);
      c.fillStyle='#1a2c32';c.fillRect(x+4,101,1,248);
      for(let y=115;y<355;y+=13){c.fillStyle='#28404735';c.fillRect(x+10,y,30,1);}
    }
    c.fillStyle='#193038';c.fillRect(146,357,708,8);c.fillStyle='#79c5c8';c.globalAlpha=.18;c.fillRect(146,359,708,1);c.globalAlpha=1;
    for (const y of [380,405,441,490,552]) {c.strokeStyle='#51707820';c.beginPath();c.moveTo(0,y);c.lineTo(1000,y);c.stroke();}
    for(let x=-700;x<1800;x+=150) {c.strokeStyle='#51707820';c.beginPath();c.moveTo(500+(x-500)*.3,365);c.lineTo(x,560);c.stroke();}
    // Ceiling strips and side illumination reflected on the floor.
    for (const x of [260,500,740]) {
      const beam=c.createLinearGradient(0,80,0,370);beam.addColorStop(0,'#8bddd91c');beam.addColorStop(1,'#8bddd900');
      polygon([[x-28,82],[x+28,82],[x+100,370],[x-100,370]],beam);
      c.shadowColor='#94e2df';c.shadowBlur=18;c.fillStyle='#9fcac8';c.fillRect(x-40,77,80,3);c.shadowBlur=0;
      const shine=c.createRadialGradient(x,394,1,x,394,120);shine.addColorStop(0,'#71cecc0a');shine.addColorStop(1,'#71cecc00');c.fillStyle=shine;c.fillRect(x-120,365,240,180);
    }
    for (const [x,dir] of [[55,1],[945,-1]]) {
      for(let i=0;i<3;i++) {const xx=x+dir*i*32;c.strokeStyle='#b8d8d330';c.lineWidth=2;c.beginPath();c.moveTo(xx,40+i*18);c.lineTo(xx,475-i*43);c.stroke();}
      c.shadowBlur=14;c.shadowColor='#95ddd7';c.fillStyle='#b3d7d2';c.fillRect(x,153,2,136);c.shadowBlur=0;
    }
    c.textAlign='center';c.font='700 51px system-ui';c.fillStyle='#759da812';c.fillText('01',500,213);
    c.font='8px ui-monospace,monospace';c.fillStyle='#71949755';c.fillText('CONTROLLER STUDIO  /  PRECISION LAB',500,241);
    c.strokeStyle='#b3a57142';c.lineWidth=3;c.beginPath();c.moveTo(105,516);c.lineTo(895,516);c.stroke();
    for(let x=100;x<900;x+=25)polygon([[x,528],[x+10,528],[x+1,538],[x-9,538]],'#b3a5711a');
    const vignette=c.createRadialGradient(500,235,140,500,280,590);vignette.addColorStop(0,'#01090c00');vignette.addColorStop(1,'#01070cc9');c.fillStyle=vignette;c.fillRect(0,0,1000,560);
    return canvas;
  }
  draw(ctx, game, impacts, width, height) {
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#050c10';ctx.fillRect(0,0,width,height);
    const viewport=RangeRenderer.viewport(width,height);ctx.setTransform(viewport.scale,0,0,viewport.scale,viewport.x,viewport.y);
    if(!this.background)this.background=this.backdrop();ctx.drawImage(this.background,0,0,1000,560);
    const circle=(x,y,r,fill,stroke,line=1)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}};
    // Targets hang from slim rails; hit geometry remains the original 36-unit circle.
    game.targets.forEach((target,index)=>{
      if(target.respawnAt!==null)return;
      const {x,y}=game.position(target),r=target.radius;
      ctx.strokeStyle='#567b7e35';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-12,94);ctx.lineTo(x-12,y-r);ctx.moveTo(x+12,94);ctx.lineTo(x+12,y-r);ctx.stroke();
      ctx.fillStyle='#15292e';ctx.fillRect(x-23,89,46,9);ctx.fillStyle='#79bdb8';ctx.fillRect(x-8,92,16,2);
      ctx.save();ctx.translate(x,383);ctx.scale(1,.18);circle(0,0,51,'#00000050');ctx.restore();
      const glow=ctx.createRadialGradient(x,y,r*.4,x,y,r*2);glow.addColorStop(0,'#f6c87919');glow.addColorStop(1,'#f6c87900');circle(x,y,r*2,glow);
      circle(x+2,y+5,r+5,'#020809','#385155',2);
      const metal=ctx.createLinearGradient(x-r,y-r,x+r,y+r);metal.addColorStop(0,'#586967');metal.addColorStop(.35,'#1f3439');metal.addColorStop(1,'#0c1b20');circle(x,y,r+3,metal,'#88a9a76b',1);
      circle(x,y,r,'#122125','#e6c581',2);
      circle(x,y,r*.77,null,'#bdab7d69',1);circle(x,y,r*.5,'#e9bd5e12','#e6c581bb',1);
      ctx.shadowColor='#f8c969';ctx.shadowBlur=10;circle(x,y,r*.28,'#f0cd83','#fff0b4',1);ctx.shadowBlur=0;
      circle(x,y,2,'#645236');
      for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const dx=Math.cos(angle),dy=Math.sin(angle);ctx.strokeStyle='#f5d79c';ctx.beginPath();ctx.moveTo(x+dx*(r-6),y+dy*(r-6));ctx.lineTo(x+dx*r,y+dy*r);ctx.stroke();}
      ctx.font='8px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#9faeaa';ctx.fillText('0'+(index+1),x,y+r+19);
    });
    for(const impact of impacts){
      const age=game.elapsed-impact.at,fade=Math.max(0,1-age/.6);if(fade<=0)continue;
      ctx.save();ctx.globalAlpha=fade;
      if(!this.reducedMotion){
        if(age<.09){ctx.strokeStyle=impact.hit?'#f7e8b469':'#bcd7d333';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(680,560);ctx.lineTo(impact.x,impact.y);ctx.stroke();}
        for(let i=0;i<(impact.hit?12:5);i++){const angle=i*2.39996+impact.x,travel=(18+(i%4)*9)*age*5;const x=impact.x+Math.cos(angle)*travel,y=impact.y+Math.sin(angle)*travel+age*age*65;ctx.fillStyle=i%3?'#e4ba76':'#fff4c9';ctx.fillRect(x,y,1+(i%2),1+(i%2));}
        circle(impact.x,impact.y,5+age*54,null,impact.hit?'#f4d49480':'#cc8a7380',1);
      }
      if(impact.hit){ctx.textAlign='center';ctx.fillStyle='#ffdfa0';ctx.font='700 18px ui-monospace,monospace';ctx.shadowColor='#111';ctx.shadowBlur=5;ctx.fillText('+'+impact.points,impact.x,impact.y-21-(this.reducedMotion?0:age*42));ctx.shadowBlur=0;}
      ctx.restore();
    }
    if(game.state==='playing'){
      const {x,y}=game.aim,last=impacts.at(-1),age=last?game.elapsed-last.at:1;
      const kick=this.reducedMotion?0:Math.max(0,1-age/.16)*5,r=(game.weapon==='shotgun'?26:7)+kick;
      ctx.strokeStyle='#e7f8ee';ctx.lineWidth=1.2;ctx.shadowColor='#000';ctx.shadowBlur=4;
      if(game.weapon==='shotgun')circle(x,y,r,null,'#d5e9d8a8',1);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ctx.beginPath();ctx.moveTo(x+dx*r,y+dy*r);ctx.lineTo(x+dx*(r+7),y+dy*(r+7));ctx.stroke();}
      circle(x,y,1.3,'#f4fce6');ctx.shadowBlur=0;
      if(last?.hit&&age<.18){ctx.strokeStyle='#ffd98e';ctx.lineWidth=2;for(const [dx,dy]of [[1,1],[-1,1],[1,-1],[-1,-1]]){ctx.beginPath();ctx.moveTo(x+dx*5,y+dy*5);ctx.lineTo(x+dx*10,y+dy*10);ctx.stroke();}}
      ctx.fillStyle='#94aba8';ctx.textAlign='left';ctx.font='9px ui-monospace,monospace';ctx.fillText('LIVE SESSION',26,535);
      ctx.textAlign='right';ctx.fillStyle=game.streak>1?'#eed08b':'#667c7c';ctx.fillText(game.streak>1?game.streak+' HIT STREAK':'MAKE EVERY SHOT COUNT',974,535);
    }
    ctx.globalAlpha=1;ctx.textAlign='left';
  }
}
