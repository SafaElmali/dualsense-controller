import { TargetPractice } from './target-practice.js';
import { CanvasDownload } from './canvas-download.js';

export class Scorecard {
  static draw(canvas, result) {
    canvas.width = 1200; canvas.height = 675;
    const ctx = canvas.getContext('2d');
    const background = ctx.createLinearGradient(0, 0, 1200, 675);
    background.addColorStop(0, '#17273b'); background.addColorStop(1, '#070b12');
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1200, 675);
    ctx.strokeStyle = '#8cb4e224'; ctx.lineWidth = 2;
    for (const r of [85, 150, 225, 310]) { ctx.beginPath(); ctx.arc(1030, 250, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#a9bad0'; ctx.font = '18px system-ui'; ctx.fillText('CONTROLLER STUDIO / TARGET PRACTICE', 64, 68);
    ctx.fillStyle = '#f6f7fa'; ctx.font = 'bold 38px system-ui'; ctx.fillText('Make every shot count.', 64, 139);
    ctx.fillStyle = '#f4d878'; ctx.font = 'bold 140px system-ui'; ctx.fillText(result.score.toLocaleString(), 56, 315);
    ctx.fillStyle = '#a9bad0'; ctx.font = '18px system-ui'; ctx.fillText('POINTS / 20 SECOND ROUND', 64, 353);
    const accuracy = result.shots ? Math.round(result.hits / result.shots * 100) : 0;
    const weapons = result.weapons.map(mode => TargetPractice.weapons[mode].label).join(' + ') || 'No shots fired';
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 40px system-ui'; ctx.fillText(accuracy + '%', 64, 447); ctx.fillText(`${result.hits}/${result.shots}`, 345, 447);
    ctx.fillStyle = '#a9bad0'; ctx.font = '16px system-ui'; ctx.fillText('ACCURACY', 64, 479); ctx.fillText('HITS / SHOTS', 345, 479);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px system-ui'; ctx.fillText(weapons, 620, 443, 510);
    ctx.fillStyle = '#a9bad0'; ctx.font = '16px system-ui'; ctx.fillText(result.weapons.length > 1 ? 'WEAPONS USED' : 'WEAPON', 620, 479);
    ctx.fillStyle = '#ffffff20'; ctx.fillRect(64, 550, 1072, 1);
    ctx.fillStyle = '#f4d878'; ctx.font = 'bold 23px system-ui'; ctx.fillText('Your turn.', 64, 611);
    ctx.textAlign = 'right'; ctx.fillStyle = '#a9bad0'; ctx.font = '19px system-ui'; ctx.fillText('dualsense-controller.netlify.app', 1136, 611); ctx.textAlign = 'left';
    return canvas;
  }
  static async save(result) {
    if (!result) throw new Error('Finish a round to save your scorecard.');
    await CanvasDownload.save(Scorecard.draw(document.createElement('canvas'), result), 'dualsense-scorecard.png');
  }
}
