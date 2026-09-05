import test from 'node:test';
import assert from 'node:assert/strict';
import { RangeRenderer } from '../controller/range-renderer.js';
import { TargetPracticeView } from '../controller/target-practice-view.js';

test('aim coordinates follow the fitted arena on wide and tall screens, ignoring the outside bars', () => {
  for (const rect of [{left:20,top:100,width:1200,height:400},{left:5,top:80,width:360,height:500}]) {
    const viewport=RangeRenderer.viewport(rect.width,rect.height);
    const x=rect.left+viewport.x+350*viewport.scale,y=rect.top+viewport.y+220*viewport.scale;
    const point=RangeRenderer.point(rect,x,y);assert.ok(Math.abs(point.x-350)<1e-9);assert.ok(Math.abs(point.y-220)<1e-9);
    assert.equal(RangeRenderer.point(rect,rect.left-1,rect.top-1),null);
  }
  assert.equal(RangeRenderer.point({left:0,top:0,width:0,height:0},0,0),null);
});
test('typing a name does not switch weapons, move the aim, or fire on either key edge', () => {
  const oldDocument=globalThis.document;globalThis.document={getElementById:()=>({open:false})};
  try {
    for (const pressed of [true,false]) for (const code of ['KeyA','Space','Digit1']) {
      TargetPracticeView.prototype.key.call({isOpen:true}, {code,target:{closest:selector=>selector.includes('input')?{}:null},preventDefault(){assert.fail('Nickname input was intercepted');}}, pressed);
    }
  } finally { globalThis.document=oldDocument; }
});
