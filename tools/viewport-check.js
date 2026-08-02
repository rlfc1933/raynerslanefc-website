// Every required viewport, every football page, against a running site:
//   node tools/viewport-check.js                       (production)
//   node tools/viewport-check.js http://127.0.0.1:8899 (local)
// Exit 1 if any page scrolls horizontally at any size.
const P = require('./viewport-probe');
const os=require('os'),fs=require('fs'),path=require('path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rlfc-chrome-'));
const BASE = (process.argv[2] || 'https://raynerslanefc.co.uk').replace(/\/$/, '');
const VIEWPORTS=[[320,568],[360,800],[375,667],[390,844],[412,915],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]];
const PAGES=['/','/fixtures.html','/squad.html','/match-centre.html?id=fwp-578225','/match-centre.html?id=fwp-578227','/programmes.html','/programme.html?id=fwp-578225'];
const EXPR=`(function(){
  var de=document.documentElement, vw=de.clientWidth, out=[];
  document.querySelectorAll('body *').forEach(function(el){
    var b=el.getBoundingClientRect();
    if(b.width===0||b.height===0) return;
    if(b.right<=vw+1 && b.left>=-1) return;
    var p=el.parentElement;
    if(p&&['auto','scroll'].indexOf(getComputedStyle(p).overflowX)>=0) return;
    out.push(el.tagName+'.'+(el.className||'').toString().slice(0,26)+' r='+Math.round(b.right));
  });
  var burger=document.querySelector('.nav__menu-btn');
  return { vw:vw, scroll:de.scrollWidth, overflow:Math.max(0,de.scrollWidth-vw),
    offenders:out.slice(0,4),
    burgerVisible: burger?getComputedStyle(burger).display!=='none':false,
    visibleNavLinks: Array.prototype.filter.call(document.querySelectorAll('.nav__link'),function(a){return getComputedStyle(a).display!=='none';}).length };
})()`;
(async()=>{
  P.launch(dir); await P.waitForChrome();
  let fails=0, checks=0;
  for(const page of PAGES){
    for(const [w,h] of VIEWPORTS){
      const o=await P.measure(BASE+page,{w,h,mobile:w<768},EXPR,{settle:1600});
      const v=o.result; checks++;
      if(!v){ console.log('NO RESULT',page,w); fails++; continue; }
      const bad=v.overflow>0;
      if(bad) fails++;
      if(bad||process.env.VERBOSE) console.log((bad?'FAIL ':'ok   ')+String(w).padStart(5)+'x'+String(h).padEnd(5)+' '+page.padEnd(38)+' scroll='+String(v.scroll).padStart(5)+' over='+String(v.overflow).padStart(4)+' links='+v.visibleNavLinks+' burger='+v.burgerVisible+(bad?' :: '+v.offenders.join(' | '):''));
    }
  }
  console.log('\n'+(fails===0?'ALL CLEAR':'FAILURES: '+fails)+' across '+checks+' page/viewport combinations');
  process.exit(fails?1:0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
