import test from 'node:test';
import assert from 'node:assert/strict';
import {animatePie} from '../src/chart-motion.js';
test('円グラフは画面に入ってから回転クラスを付け、監視を終了する',()=>{
  let callback,observed,disconnected=0;const classes=[];
  const element={classList:{add:name=>classes.push(name)}};
  class Observer{constructor(cb){callback=cb;}observe(el){observed=el;}disconnect(){disconnected++;}}
  const stop=animatePie(element,{Observer,reduced:false});assert.equal(observed,element);
  callback([{isIntersecting:false}]);assert.deepEqual(classes,[]);
  callback([{isIntersecting:true}]);assert.deepEqual(classes,['pie-spinning']);assert.equal(disconnected,1);
  stop();assert.equal(disconnected,2);
});
test('動きを減らす設定では回さず、監視非対応なら一度だけ回転を開始する',()=>{
  const classes=[],element={classList:{add:name=>classes.push(name)}};
  animatePie(element,{reduced:true,Observer:class{constructor(){assert.fail('must not observe');}}})();assert.deepEqual(classes,[]);
  animatePie(element,{reduced:false,Observer:null})();assert.deepEqual(classes,['pie-spinning']);
});
