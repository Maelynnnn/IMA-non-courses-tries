import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});


app.use(express.static('public'));


// 房间状态：最多2人
const rooms = new Map(); // roomId -> { members:Set, ready:Set, yaws:Map, host:null|socketId }


function ensureRoom(roomId){
    if (!rooms.has(roomId)) rooms.set(roomId, { members:new Set(), ready:new Set(), yaws:new Map(), host:null });
    return rooms.get(roomId);
}


io.on('connection', (socket) => {
    let joinedRoom = null;


    socket.on('join', ({ roomId }) => {
        const room = ensureRoom(roomId);
        if (room.members.size >= 2) { socket.emit('room-full'); return; }
        room.members.add(socket.id);
        if (!room.host) room.host = socket.id; // 第一个进入者为 host/先发球者
        joinedRoom = roomId;
        socket.join(roomId);
        io.to(roomId).emit('room-info', { count: room.members.size, host: room.host });
    });


    socket.on('yaw', (yaw) => {
        if (!joinedRoom) return;
        const room = ensureRoom(joinedRoom);
        room.yaws.set(socket.id, yaw);
        // 转发给对手
        socket.to(joinedRoom).emit('peer-yaw', yaw);
    });


    socket.on('ready', () => {
        if (!joinedRoom) return;
        const room = ensureRoom(joinedRoom);
        room.ready.add(socket.id);
        if (room.ready.size === 2){
            io.to(joinedRoom).emit('both-ready', { host: room.host });
            // 重置，防止反复触发
            room.ready.clear();
        }
    });


    // 对战事件转发（锁步）
    ['serve','hit','miss','sync'].forEach(ev => {
        socket.on(ev, (data) => {
            if (!joinedRoom) return;
            socket.to(joinedRoom).emit(ev, data);
        });
    });


    socket.on('disconnect', () => {
        if (!joinedRoom) return;
        const room = ensureRoom(joinedRoom);
        room.members.delete(socket.id);
        room.yaws.delete(socket.id);
        room.ready.delete(socket.id);
        if (room.host === socket.id) room.host = [...room.members][0] || null;
        io.to(joinedRoom).emit('room-info', { count: room.members.size, host: room.host });
        if (room.members.size === 0) rooms.delete(joinedRoom);
    });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));