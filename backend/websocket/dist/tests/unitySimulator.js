import { connectToBackend } from '../src/unity/unityWebSocket.js';
const socket = connectToBackend();
socket.on('open', () => {
    console.log('Unity simulator connected.');
    socket.send(JSON.stringify({
        type: 'unity.status',
        deviceId: 'unity-simulator',
        status: 'ready',
    }));
});
socket.on('message', (rawMessage) => {
    console.log('Backend:', rawMessage.toString());
});
socket.on('error', (error) => {
    console.error('Unity simulator error:', error.message);
    process.exitCode = 1;
});
socket.on('close', () => {
    console.log('Unity simulator disconnected.');
});
//# sourceMappingURL=unitySimulator.js.map