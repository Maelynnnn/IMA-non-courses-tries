// 预留接口：若你接入 AprilTag/WebXR，请实现下列函数并在 client.js 中切换启用。
export function startTagTracker(){ /* 打开摄像头、识别标记、solvePnP 得到 t.x → 映射 [-1,1] */ }
export function getXNorm(){ return 0; }
export function center(){ /* 以当前 t.x 作为 0 点 */ }
export function isReady(){ return false; }