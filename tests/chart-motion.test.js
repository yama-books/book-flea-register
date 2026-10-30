import test from 'node:test';
import assert from 'node:assert/strict';
import {animatePie,animateCharts} from '../src/chart-motion.js';
function fixture(){
  let callback,options,disconnected=0;const observed=[],removed=[];
  const element=()=>({classes:[],classList:{add(name){this.owner.classes.push(name);}}});
  const make=()=>{const el=element();el.classList.owner=el;return el;};
  class Observer{constructor(cb,opts){callback=cb;options=opts;}observe(el){observed.push(el);}unobserve(el){removed.push(el);}disconnect(){disconnected++;}}
  return {make,Observer,observed,removed,emit:entries=>callback(entries),get options(){return options;},get disconnected(){return disconnected;}};
}
test('円は25%以上見えてから一度だけ回転し、監視を終了する',()=>{
  const f=fixture(),el=f.make();animatePie(el,{Observer:f.Observer,reduced:false});
  assert.deepEqual(f.observed,[el]);assert.equal(f.options.threshold,.25);
  f.emit([{target:el,isIntersecting:true,intersectionRatio:.1}]);assert.deepEqual(el.classes,[]);
  f.emit([{target:el,isIntersecting:true,intersectionRatio:.25}]);assert.deepEqual(el.classes,['pie-spinning']);
  f.emit([{target:el,isIntersecting:true,intersectionRatio:1}]);assert.deepEqual(el.classes,['pie-spinning']);assert.equal(f.disconnected,1);
});
test('時間帯の行は個別に可視判定し、差替後の遅延通知を無視する',()=>{
  const f=fixture(),a=f.make(),b=f.make(),stop=animateCharts([a,b],{Observer:f.Observer,reduced:false});
  f.emit([{target:a,isIntersecting:true,intersectionRatio:1},{target:b,isIntersecting:false,intersectionRatio:0}]);
  assert.deepEqual(a.classes,['chart-entered']);assert.deepEqual(b.classes,[]);assert.deepEqual(f.removed,[a]);assert.equal(f.disconnected,0);
  stop();f.emit([{target:b,isIntersecting:true,intersectionRatio:1}]);assert.deepEqual(b.classes,[]);assert.equal(f.disconnected,1);
});
test('動き低減では静止し、監視非対応なら表示時に開始、空要素なら監視しない',()=>{
  const f=fixture(),el=f.make(),Never=class{constructor(){assert.fail('must not observe');}};
  animatePie(el,{reduced:true,Observer:Never})();assert.deepEqual(el.classes,[]);
  animatePie(el,{reduced:false,Observer:null})();assert.deepEqual(el.classes,['pie-spinning']);
  animateCharts([],{reduced:false,Observer:Never})();
});
