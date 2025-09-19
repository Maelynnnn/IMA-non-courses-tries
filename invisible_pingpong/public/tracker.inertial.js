// 通过加速度近似积分估计“左右位移”。
// 说明：长时会漂，但命中窗口很短，体验可接受。支持“居中”瞬时校正。


import { clamp, lp } from './utils.js';


let enabled = false;
let vx = 0, x = 0; // m/s, m（近似量纲）
let lastT = performance.now();


let gravity = {x:0,y:0,z:0};
let accRaw = {x:0,y:0,z:0};
let rollDeg = 0; // 用于将设备X轴作为“左右”轴参考


export function getXNorm(){
// 将 x（米的近似）映射到 [-1,1]
const X_MAX = 0.40; // 0.4m
return clamp(x / X_MAX, -1, 1);
}


export function center(){ x = 0; vx = 0; }


export function getRoll(){ return rollDeg; }


export function startInertial(){
if (enabled) return;
enabled = true;


// 方向（roll）
window.addEventListener('deviceorientation', (e)=>{
if (typeof e.gamma === 'number') rollDeg = e.gamma; // 左右倾
}, true);


// 加速度（含重力）
window.addEventListener('devicemotion', (e)=>{
const a = e.accelerationIncludingGravity;
if (!a) return;
// 低通估重力（站立持握下平均即重力）
gravity.x = lp(gravity.x, a.x ?? 0, 0.05);
gravity.y = lp(gravity.y, a.y ?? 0, 0.05);
gravity.z = lp(gravity.z, a.z ?? 0, 0.05);


// 线性加速度 ≈ 总加速度 - 重力
accRaw.x = (a.x ?? 0) - gravity.x;
accRaw.y = (a.y ?? 0) - gravity.y;
accRaw.z = (a.z ?? 0) - gravity.z;


// 取“设备X轴”为左右方向分量（简化）
const ax = accRaw.x; // m/s^2


const now = performance.now();
const dt = Math.min(0.050, Math.max(0.010, (now - lastT)/1000)); // 10~50ms
lastT = now;


// 积分（半隐式欧拉）+ 阻尼
vx += ax * dt;
vx *= 0.98; // 速度阻尼
x += vx * dt;


// 软回正（避免飘太远）：极轻微弹性牵引
x *= 0.9995;


// 限幅（物理安全区）
const XHARD = 0.60; // 0.6m
if (x > XHARD) { x = XHARD; vx*=0.2; }
if (x < -XHARD) { x = -XHARD; vx*=0.2; }
}, { capture:true });
}