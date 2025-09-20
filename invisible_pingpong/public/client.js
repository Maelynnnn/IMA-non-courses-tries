import { clamp, lp, degDiff, sleep } from './utils.js';
import { socket, joinRoom, syncTime } from './net.js';
import { startInertial, getXNorm, center, getRoll } from './tracker.inertial.js';

let serverIsMe = false;        // 当前是否轮到“我”发球
const PREP_DELAY = 450;        // 发球/回击前的准备延时（毫秒）
const HIT_WIN    = 700;        // 命中窗口（毫秒）
const POS_TOL    = 0.18;       // 位置容差（0~1 归一化）
const FLIGHT_MS_BASE    = 1000;// 飞行基础时长
const FLIGHT_MS_VARIANT = 350;


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

let serveArmed = false;        // 是否在“等待发球挥拍”的待机状态
const SERVE_TIMEOUT = 5000;    // 点按钮后 3 秒内有效

// —— 对战动画/命中 ——
let activeBall = null; // {xTarget, startAt, tFlight}


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
  clockOffset = await syncTime();
  calib.hidden = true; play.hidden = false; state = 'play';

  serverIsMe = isHost;                // 开局由 host 发
  renderServeBtn();
  statusEl.textContent = serverIsMe ? '你是发球方' : '等待对方发球';
});

function renderServeBtn(){
  // 只有轮到你发球、且当前没有在飞的球，按钮才可用
  serveBtn.disabled = !serverIsMe || !!activeBall || state !== 'play';
}



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

// —— 挥拍检测（更宽松 & 去重力）——
let ang = { x:0, y:0, z:0 };
let acc = { x:0, y:0, z:0 };
let lastSwing = 0;

window.addEventListener('devicemotion', (e) => {
  // 角速度（deg/s→rad/s）+ 轻微低通
  const rr = e.rotationRate || {};
  const rx = (rr.alpha || 0) * Math.PI/180;
  const ry = (rr.beta  || 0) * Math.PI/180;
  const rz = (rr.gamma || 0) * Math.PI/180;
  ang.x = lp(ang.x, rx, 0.35);
  ang.y = lp(ang.y, ry, 0.35);
  ang.z = lp(ang.z, rz, 0.35);

  // 加速度：优先用不含重力；否则用含重力并减去 g
  const a = e.acceleration || e.accelerationIncludingGravity || {};
  let ax = a.x || 0, ay = a.y || 0, az = a.z || 0;
  acc.x = lp(acc.x, ax, 0.3);
  acc.y = lp(acc.y, ay, 0.3);
  acc.z = lp(acc.z, az, 0.3);

  // 去重力后的模长
  let amag = Math.hypot(ax, ay, az);
  if (!e.acceleration) amag = Math.max(0, amag - 9.81);

  // —— 每帧尝试“消费一次挥拍” —— //
  const swing = detectSwing(amag);
  if (swing) {
    navigator.vibrate?.(20); // 触觉提示

    // 点了“开始发球” → 用这次挥拍真正发球
    if (serveArmed && !activeBall) { performServe(swing); return; }

    // 命中窗口内且到位 → 回击
    if (activeBall) {
      const now = Date.now();
      const { startAt, tFlight, xTarget } = activeBall;
      const HIT_WIN = 250;
      if (now >= startAt && now <= startAt + tFlight + HIT_WIN) {
        const inPos = Math.abs(getXNorm() - xTarget) < 0.12;
        if (inPos) {
          const next = swingToTarget(swing);
          const nstart = Date.now() + clockOffset + 150;
          activeBall = { xTarget: next.x_target, startAt: nstart, tFlight: next.t_flight };
          statusEl.textContent = '回击成功 → 对方';
          socket.emit('hit', { x_target: next.x_target, t_flight: next.t_flight, startAt: nstart });
        }
      }
    }
  }
}, { capture: true });

function detectSwing(amag = 0) {
  const now = performance.now();
  const speed = Math.hypot(ang.x, ang.y, ang.z); // rad/s

  // 满足其一即可：角速度或（去重力后）线加速度达到阈值
  const hit = (speed > 2.2) || (amag > 3.0);
  if (!hit) return null;
  if (now - lastSwing < 200) return null;  // 去抖

  lastSwing = now;
  // 用 z/y 中幅度更大的分量决定方向
  const dir = Math.sign(Math.abs(ang.z) > Math.abs(ang.y) ? ang.z : ang.y) || 1;
  const mag = Math.max(0.2, Math.min(1, speed / 8)); // 给最小幅度
  return { dir, mag, t: now };
}





function swingToTarget(s){
  const k = 0.55;
  const cur = getXNorm();
  const x_target = clamp(cur + k * s.dir * s.mag, -1, 1);
  const t_flight = FLIGHT_MS_BASE + Math.round((1 - s.mag) * FLIGHT_MS_VARIANT);
  return { x_target, t_flight };
}




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

// 简单纵向下落动画：从上侧 15% 掉到下侧 85%
const C = document.querySelector('#canvas.play');
const H = C.clientHeight;
const y = Math.min(1, Math.max(0, t / tFlight));       // 0→1
const topPx = Math.round((0.15 + 0.70 * y) * (H - targetEl.clientHeight));
targetEl.style.top = `${topPx}px`;

} else {
// 到达命中瞬间：开启命中窗口 250ms
const HIT_WIN = 250;
const now = Date.now();
// const inPos = Math.abs(getXNorm() - xTarget) < 0.12;
const canSwing = true; // 由按钮或再次挥拍触发

// 命中判定时
const inPos = Math.abs(getXNorm() - xTarget) < POS_TOL;

if (now - startAt <= tFlight + HIT_WIN){
// 等待玩家挥拍回击
} else {
// 时间窗过了，若未命中则 miss
statusEl.textContent = '接球失败';
socket.emit('miss', { reason:'timeout' });
activeBall = null;
//serveBtn.disabled = isHost; // 失误后由对方发球
}
}
}
}

function performServe(s) {
  const { x_target, t_flight } = swingToTarget(s);
  const startAt = Date.now() + clockOffset + PREP_DELAY; // 预留准备时间
  activeBall = { xTarget: x_target, startAt, tFlight: t_flight };
  statusEl.textContent = '发球 → 对方';
  socket.emit('serve', { x_target, t_flight, startAt });
  serveArmed = false;
  renderServeBtn();
}




serveBtn.onclick = () => {
  // 进入“待机等挥拍”状态
  serveArmed = true;
  statusEl.textContent = '请在 5 秒内挥拍发球…';

  // 3 秒后还没挥拍则取消
  setTimeout(() => {
    if (serveArmed) {
      serveArmed = false;
      statusEl.textContent = '未检测到挥拍，请重试';
    }
  }, SERVE_TIMEOUT);
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
  serverIsMe = false;                          // 对方在发
  renderServeBtn();
  targetEl.style.display = 'block';
  activeBall = { xTarget: x_target, startAt, tFlight: t_flight };
  statusEl.textContent = '对方发球 → 你的回合';
});



socket.on('hit', ({ x_target, t_flight, startAt })=>{
targetEl.style.display='block';
activeBall = { xTarget: x_target, startAt, tFlight: t_flight };
statusEl.textContent = '对方回击 → 你的回合';
});


socket.on('miss', ({ reason })=>{
  activeBall = null;
  // 失误后交换发球权
  serverIsMe = !serverIsMe;
  renderServeBtn();
  statusEl.textContent = serverIsMe ? '对方失误，轮到你发球' : '你这一分失误，等待对方发球';
  targetEl.style.display = 'none';
});


// 主循环
function loop(){
if (state === 'calib') calibTick();
if (state === 'play') playTick();
logEl.textContent = `state=${state}\nroll=${getRoll().toFixed(1)}°\nyaw=${yaw?.toFixed?.(1)??'—'} peerYaw=${peerYaw?.toFixed?.(1)??'—'}\nx=${getXNorm().toFixed(3)}\n`;
requestAnimationFrame(loop);
}
loop();