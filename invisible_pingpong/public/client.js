import { clamp, lp, degDiff, sleep } from './utils.js';
import { socket, joinRoom, syncTime } from './net.js';
import { startInertial, getXNorm, center, getRoll } from './tracker.inertial.js';


// —— DOM ——
const $ = (s)=>document.querySelector(s);
const lobby = $('#lobby');
const perm = $('#perm');
const calib = $('#calib');
const play = $('#play');

// —— DOM ——（在原来的基础上补3个）
const waiting   = document.querySelector('#waiting');
const roomLabel = document.querySelector('#roomLabel');
const permEarlyBtn = document.querySelector('#permEarlyBtn');

let motionGranted = false; // 是否已获得体感权限



const joinBtn = $('#joinBtn');
const roomInp = $('#room');
const lobbyInfo = $('#lobbyInfo');


const motionBtn = $('#motionBtn');
const cameraBtn = $('#cameraBtn'); // 未来接入 Tag/AR 再启用


const toggleMode = $('#toggleMode');
const modeHint = $('#modeHint');
const readyBtn = $('#readyBtn');
const calibHint = $('#calibHint');
const line = $('#line');


const serveBtn = $('#serveBtn');
const centerBtn= $('#centerBtn');
const statusEl = $('#status');
const targetEl = $('#target');
const paddleEl = $('#paddle');
const hostBadge= $('#hostBadge');
const logEl = $('#log');


let state = 'lobby';
let roomId = '';
let hostId = null; // 先加入者
let isHost = false;


let needFaceToFace = false; // 默认“同向”更稳
let yaw = null, peerYaw = null;
let roll = 0;
let alignOK = false, steadyMs = 0, lastTs = performance.now();
let bothReady = false;
let clockOffset = 0; // 本地对服务器时间偏移

// —— 大厅 ——
joinBtn.onclick = async () => {
  roomId = (roomInp.value || '').trim();
  if (!roomId) { alert('请输入房间号'); return; }
  const info = await joinRoom(roomId);

  hostId = info?.host || null;
  isHost = socket.id === hostId;
  hostBadge.hidden = !isHost;

  roomLabel.textContent = roomId;

  // 根据人数决定显示什么
  if ((info?.count || 1) === 1) {
    // 第一位进入者 → 等待页
    lobby.hidden = true;
    waiting.hidden = true; // 先隐藏一下避免闪烁
    waiting.hidden = false;
    state = 'waiting';
  } else {
    // 房间里已经有 1 人，你是第 2 人 → 跳到校准（若未授权则先到权限页）
    lobby.hidden = true;
    if (!motionGranted) {
      perm.hidden = false; state = 'perm';
    } else {
      calib.hidden = false; state = 'calib';
    }
  }
};



async function enableMotion() {
  try {
    if (typeof DeviceMotionEvent?.requestPermission === 'function') {
      const st1 = await DeviceMotionEvent.requestPermission();
      if (st1 !== 'granted') throw new Error('未授权 DeviceMotion');
    }
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      const st2 = await DeviceOrientationEvent.requestPermission();
      if (st2 !== 'granted') throw new Error('未授权 DeviceOrientation');
    }
  } catch (e) {
    alert(e.message || e);
    return false;
  }
  // 启动追踪与监听（保持你原来的逻辑）
  startInertial();
  window.addEventListener('deviceorientation', (e) => {
    if (typeof e.alpha === 'number') { yaw = e.alpha; socket.emit('yaw', yaw); }
    if (typeof e.gamma === 'number') { roll = e.gamma; }
  }, true);
  motionGranted = true;
  return true;
}



// —— 权限 ——
motionBtn.onclick = async () => {
  const ok = await enableMotion();
  if (!ok) return;
  // 从“权限页”进入校准页
  perm.hidden = true;
  calib.hidden = false;
  state = 'calib';
};

permEarlyBtn.onclick = async () => {
  await enableMotion();
  // 仍然停留在等待页，等第二个人加入后会自动跳到校准
};



// —— 校准 ——
toggleMode.onclick = ()=>{
needFaceToFace = !needFaceToFace;
modeHint.textContent = needFaceToFace ? '面对面' : '同向';
};


socket.on('peer-yaw', (y) => { peerYaw = y; });
socket.on('room-info', (info) => {
  lobbyInfo.textContent = `房间人数：${info.count}`;
  hostId = info.host; isHost = socket.id === hostId; hostBadge.hidden = !isHost;

  // 如果我在“等待页”，且人数变为 2 → 进入校准（未授权则先到权限页）
  if (state === 'waiting' && info.count === 2) {
    waiting.hidden = true;
    if (!motionGranted) {
      perm.hidden = false; state = 'perm';
    } else {
      calib.hidden = false; state = 'calib';
    }
  }

  // 反向处理：如果在校准/对局阶段对方断线（count 回到 1），你也可以选择退回等待
  // 简版可先不处理；需要的话加：
  // if ((state==='calib'||state==='play') && info.count===1) { play.hidden=true; calib.hidden=true; waiting.hidden=false; state='waiting'; }
});



socket.on('both-ready', async ({host})=>{
hostId = host; isHost = socket.id === hostId; hostBadge.hidden = !isHost;
bothReady = true;
// 对时
clockOffset = await syncTime();
calib.hidden = true; play.hidden = false; state = 'play';
statusEl.textContent = isHost ? '你是发球方' : '等待对方发球';
serveBtn.disabled = !isHost;
});


readyBtn.onclick = ()=>{ /* 仅做展示；实际由稳定计时自动触发 */ };


function calibTick(){
const now = performance.now();
const dt = now - lastTs; lastTs = now;


const rollOk = Math.abs(roll) < 5;
let yawOk = true;
if (peerYaw!=null && yaw!=null){
yawOk = needFaceToFace ? Math.abs(degDiff(yaw, peerYaw) - 180) < 15 : degDiff(yaw, peerYaw) < 15;
}
const ok = rollOk && yawOk;
if (ok) steadyMs += dt; else steadyMs = 0;
document.querySelector('#calib').classList.toggle('align-ok', ok);


if (!rollOk) calibHint.textContent = (roll>0)?'向左微调手机 ↖':'向右微调手机 ↗';
else if (!yawOk) calibHint.textContent = needFaceToFace?'与对方面对：再转一点':'与对方同向：再转一点';
else calibHint.textContent = '对齐良好，保持稳定…';


readyBtn.disabled = !ok;


if (steadyMs > 800 && !bothReady){ // 稳定 0.8s 自动上报
bothReady = true; socket.emit('ready');
}
}

// —— 挥拍检测 ——
let ang = {x:0,y:0,z:0}, acc={x:0,y:0,z:0}, lastSwing=0;
window.addEventListener('devicemotion', (e)=>{
const rr = e.rotationRate || {};
// deg/s -> rad/s
const rx = (rr.alpha||0)*Math.PI/180, ry=(rr.beta||0)*Math.PI/180, rz=(rr.gamma||0)*Math.PI/180;
ang.x = lp(ang.x, rx); ang.y=lp(ang.y, ry); ang.z=lp(ang.z, rz);
const ai = e.accelerationIncludingGravity || {};
acc.x = lp(acc.x, ai.x||0); acc.y = lp(acc.y, ai.y||0); acc.z = lp(acc.z, ai.z||0);
}, { capture:true });


function detectSwing(){
const now = performance.now();
const speed = Math.hypot(ang.x,ang.y,ang.z);
const accel = Math.hypot(acc.x,acc.y,acc.z);
if (now - lastSwing < 250) return null;
if (speed > 4.5 && accel > 10){
lastSwing = now;
const dir = Math.sign(ang.z || ang.y || 1);
const mag = Math.min(speed/10,1);
return {dir,mag,t:now};
}
return null;
}


function swingToTarget(s){
const k = 0.55;
let cur = getXNorm();
let x_target = clamp(cur + k * s.dir * s.mag, -1, 1);
const t_flight = 500 + Math.round((1 - s.mag)*120);
return { x_target, t_flight };
}

// —— 对战动画/命中 ——
let activeBall = null; // {xTarget, startAt, tFlight}


function playTick(){
// 更新拍面位置
const x = getXNorm();
const W = document.querySelector('#canvas.play').clientWidth;
const px = (x*0.5 + 0.5) * (W - paddleEl.clientWidth);
paddleEl.style.left = `${px}px`;


// 绘制目标圈（如果有在飞球）
if (activeBall){
const { startAt, tFlight, xTarget } = activeBall;
const t = Date.now() - startAt;
if (t < 0){ /* 等待 */ }
else if (t < tFlight){
// 可在此加入小球动画；目标圈放到底部固定位置
const tx = (xTarget*0.5 + 0.5) * (W - targetEl.clientWidth);
targetEl.style.left = `${tx}px`;
} else {
// 到达命中瞬间：开启命中窗口 250ms
const HIT_WIN = 250;
const now = Date.now();
const inPos = Math.abs(getXNorm() - xTarget) < 0.12;
const canSwing = true; // 由按钮或再次挥拍触发


if (now - startAt <= tFlight + HIT_WIN){
// 等待玩家挥拍回击
} else {
// 时间窗过了，若未命中则 miss
statusEl.textContent = '接球失败';
socket.emit('miss', { reason:'timeout' });
activeBall = null;
serveBtn.disabled = isHost; // 失误后由对方发球
}
}
}
}

// 交互：发球/回击
serveBtn.onclick = ()=>{
const s = detectSwing();
if (!s){ statusEl.textContent='请挥拍发球'; return; }
const { x_target, t_flight } = swingToTarget(s);
const startAt = Date.now() + clockOffset + 200; // 预留 200ms
activeBall = { xTarget: x_target, startAt, tFlight: t_flight };
statusEl.textContent = '发球 → 对方';
socket.emit('serve', { x_target, t_flight, startAt });
serveBtn.disabled = true;
};


// 回击：在目标窗口内再次挥拍
window.addEventListener('click', tryHit); // 你也可以改成“再次挥拍检测”
function tryHit(){
if (!activeBall) return;
const { startAt, tFlight, xTarget } = activeBall;
const now = Date.now();
const HIT_WIN = 250;
const within = now - startAt;
if (within < 0 || within > tFlight + HIT_WIN) return;


const inPos = Math.abs(getXNorm() - xTarget) < 0.12;
const s = detectSwing();
if (inPos && s){
const next = swingToTarget(s);
const nstart = Date.now() + clockOffset + 150;
activeBall = { xTarget: next.x_target, startAt: nstart, tFlight: next.t_flight };
statusEl.textContent = '回击成功 → 对方';
socket.emit('hit', { x_target: next.x_target, t_flight: next.t_flight, startAt: nstart });
}
}

centerBtn.onclick = ()=>{ center(); };


// 接收网络事件
socket.on('serve', ({ x_target, t_flight, startAt })=>{
targetEl.style.display='block';
activeBall = { xTarget: x_target, startAt, tFlight: t_flight };
statusEl.textContent = '对方发球 → 你的回合';
serveBtn.disabled = true;
});


socket.on('hit', ({ x_target, t_flight, startAt })=>{
targetEl.style.display='block';
activeBall = { xTarget: x_target, startAt, tFlight: t_flight };
statusEl.textContent = '对方回击 → 你的回合';
});


socket.on('miss', ({ reason })=>{
statusEl.textContent = '对方失误，你发球';
activeBall = null;
serveBtn.disabled = !isHost;
});

// 主循环
function loop(){
if (state === 'calib') calibTick();
if (state === 'play') playTick();
logEl.textContent = `state=${state}\nroll=${getRoll().toFixed(1)}°\nyaw=${yaw?.toFixed?.(1)??'—'} peerYaw=${peerYaw?.toFixed?.(1)??'—'}\nx=${getXNorm().toFixed(3)}\n`;
requestAnimationFrame(loop);
}
loop();