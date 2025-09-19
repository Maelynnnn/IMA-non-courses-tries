export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lp = (p, n, a=0.2) => p*(1-a)+n*a; // 低通
export function degDiff(a,b){ let d = Math.abs(a-b)%360; return d>180?360-d:d; }
export const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));


// 简单对时：多次 ping
export async function measureOffset(socket, rounds=5){
let offsetSum=0;
for (let i=0;i<rounds;i++){
const t0 = Date.now();
const s = await new Promise(res=>{
socket.timeout(2000).emit('sync', { t0 }, (sv) => res(sv));
});
const t2 = Date.now();
const rtt = t2 - t0;
const offset = (s.serverTime - (t0 + rtt/2));
offsetSum += offset;
await sleep(80);
}
return Math.round(offsetSum/rounds);
}