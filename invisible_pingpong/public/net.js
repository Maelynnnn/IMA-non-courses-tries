import { measureOffset } from './utils.js';


// 连接同源 Socket.IO（也可改为你的 WS 服务器 URL）
export const socket = io({ path: '/socket.io' });


export async function joinRoom(roomId){
return new Promise((res)=>{
socket.emit('join', { roomId });
socket.once('room-info', (info)=> res(info));
});
}


// 服务器对时响应（供 utils.measureOffset 使用）
socket.on('sync', (data, cb)=> { cb?.({ serverTime: Date.now() }); });


export async function syncTime(){
return await measureOffset(socket, 5);
}