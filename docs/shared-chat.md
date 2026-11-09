# Shared chat

Several people can chat in one conversation at the same time.

- **Host.** One person starts a shared chat from **Share** (top right of the home pane). Their app runs the AI with their own keys, answers every message in turn, and streams the conversation to everyone.
- **Guests.** They join with an invite the host copies. An invite either lets them write or only watch. Guests need no API key.
- **Relay.** A small server passes messages between people. It never sees an API key and never runs a model. Rooms live in memory and end when the host leaves.

```
npm run relay          # listens on :8787 (PORT=… to change)
```

Use `ws://localhost:8787` on one machine. For real people put the relay behind TLS and use `wss://your-host`.

Messages from several people queue behind the host's AI: it answers one at a time, in the order they arrive.
