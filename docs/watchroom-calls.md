# Watchroom cameras and microphones

Calls are optional in Party Hub rooms and player watch parties. Join a call to listen, then use **Mic** and **Camera** independently. Both devices start off. Turning a device off releases it; leaving the call, leaving the room, losing the connection, or navigating away stops all capture. A new call or a recovered room never automatically reactivates devices. Movie controls and watch-party hosting are separate from calls.

Calls use native WebRTC, with Socket.IO carrying room-scoped connection messages. SwiflyTV does not record call media. Each call supports eight participants, with camera capture capped at 640×360 and 15fps to leave bandwidth for the movie. HTTPS and a browser with WebRTC/media-device support are required; localhost works for development. Use headphones to reduce movie audio leaking into the microphone.

## Network setup

The default ICE configuration uses the public Google STUN service. Direct connections work when the participants' networks allow them. Some mobile, school, corporate, VPN, and restrictive NAT networks require a TURN relay. A STUN-only deployment cannot guarantee a connection between those networks.

Set `WATCHROOM_ICE_SERVERS` to a JSON array of standard WebRTC ICE-server records to supply a relay, for example:

```json
[
  {"urls":"stun:stun.l.google.com:19302"},
  {
    "urls":["turn:turn.example.com:3478?transport=udp","turns:turn.example.com:5349?transport=tcp"],
    "username":"REPLACE_WITH_TURN_USERNAME",
    "credential":"REPLACE_WITH_TURN_CREDENTIAL"
  }
]
```

Use your own relay or provider credentials; the example is not a working server. Store the value in the deployment's environment, not source control. ICE credentials are necessarily delivered to call participants, so use a provider's scoped credentials and limits. A future credential broker can issue short-lived TURN credentials if the relay supports it.

The server validates the configuration and sends it only when a room member explicitly joins a call. Connection messages are forwarded only between active callers in that same room, with a fresh call session on every join. Old sessions and cross-room targets are rejected. Call state is ephemeral and does not survive a server restart.

## Verification

Run `npm run check` and `npm run test:ui -- --test-concurrency=4`. The call browser test uses fake camera/audio devices in two Chromium contexts and verifies actual peer media, camera changes, late joining, and cleanup. It does not access the developer's or user's real camera or microphone. Testing a deployed TURN service additionally requires two devices on different networks.
