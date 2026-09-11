# PeanutBot
A persistent Node.js + Express + Socket.io + Mineflayer bridge with a standalone chat page. Includes a Dockerfile and Fly configuration. Requires Minecraft Java Edition and permission to run a bot on the server. Bedrock Edition is not supported.

## Local setup
1. Install Node.js 22 or newer. Extract this project and run npm install.
2. Edit config.json: set minecraft.host, port, username and auth. The default port is 25565. Set web.token to a long random secret (or use BRIDGE_TOKEN). Never commit production credentials.
3. Run npm start. Open http://localhost:3000 and enter your bridge token.
4. Offline auth only works on a server configured for offline accounts; it does not bypass authentication. For an online-mode server set auth to online (mapped to microsoft). Set username to your licensed Microsoft account email and complete the device-code sign-in instructions in the server logs on first launch. The bot's visible name will be that account's Minecraft name, not an arbitrary PeanutBot nickname.

## Connect the Base44 dashboard
Deploy this companion service first. In the PeanutBot dashboard, open Connection settings, enter the HTTPS service URL and bridge token, then Connect bridge. Set ALLOWED_ORIGINS to the exact origin of your published Base44 site; add a preview origin separately if needed, comma-separated. Same-origin standalone chat works without this setting. Use HTTPS when the dashboard is HTTPS. Tokens are kept in memory by the dashboard, not written into browser storage. The authenticated socket can send messages and reconnect the bot: share the token only with trusted operators.

## Configuration and environment variables
MC_HOST, MC_PORT, MC_USERNAME, MC_AUTH override the Minecraft config. MC_AUTH supports offline, online, or microsoft. PORT overrides web.port. BRIDGE_TOKEN overrides web.token. ALLOWED_ORIGINS is a comma-separated list of trusted browser origins. AUTH_FOLDER defaults to .auth; persist this folder for Microsoft login. The service listens on 0.0.0.0. There is no built-in user account system; all token holders share the bot identity. Chat history is in memory (latest 200 messages) and resets on restart. Web messages appear after Mineflayer accepts a send, not a delivery receipt from Minecraft.

## Railway
Create a project from a Git repository containing these files. Railway can build the included Dockerfile. Set MC_HOST, MC_PORT, MC_USERNAME, MC_AUTH, BRIDGE_TOKEN and ALLOWED_ORIGINS in service variables. Generate a public HTTPS domain and use it as the bridge URL. Keep one replica, turn off sleeping/serverless behavior if enabled, and choose resources/billing suitable for continuous use. For online auth mount a persistent volume at /app/.auth and finish the first device login through the logs. Confirm the service can reach your Minecraft host and port.

## Render
Create a Web Service from your repository, using Docker, or Node with build command npm install and start command npm start. Add the environment variables above. Use the /health path for a health check. Choose a paid always-on instance: sleeping free services are not suitable for a 24/7 bot. Add a persistent disk at /app/.auth for Docker (or set AUTH_FOLDER to your disk mount path). Use one instance and its HTTPS URL as the bridge URL. Complete Microsoft login via logs if required.

## Fly.io
Install and sign in to the Fly CLI, edit fly.toml to a unique app name and preferred region, and run fly apps create YOUR_APP_NAME. Create the volume with fly volumes create peanutbot_auth --region iad --size 1 (match the configured region). Set credentials with fly secrets set MC_HOST=your.server MC_PORT=25565 MC_USERNAME=PeanutBot MC_AUTH=offline BRIDGE_TOKEN=your-long-random-secret ALLOWED_ORIGINS=https://your-published-site. Run fly deploy, then fly scale count 1. The provided config disables auto-stop and keeps a machine running. Use fly logs for Microsoft device login. Machines and persistent volumes may incur charges.

## Behavior and operations
The bot connects on startup, retries 5 seconds after a dropped connection, and can be manually reconnected by an authenticated operator. It jumps briefly every 45 seconds for anti-AFK. This is best-effort: follow server rules, and do not use it to evade moderation. The online-player list comes from Mineflayer. Vanilla chat events are forwarded; servers with custom chat plugins may need custom parsing. Web sends are single-line, at most 256 characters, rate limited to one per second per socket; slash commands are blocked. Vanilla servers can apply additional chat restrictions. Use one service instance: multiple replicas would create competing bot logins. A host/port on your private home network is not reachable from cloud hosting without appropriate networking. Never expose an offline Minecraft server to untrusted players without appropriate protection.

## Troubleshooting
Check server logs for unsupported Minecraft versions, whitelist failures, invalid credentials, networking issues or Microsoft login prompts. Whitelist the bot's real account name. HTTPS mixed-content blocks an HTTP bridge from an HTTPS dashboard. Browser connection errors can also mean ALLOWED_ORIGINS does not match. Disconnections can be caused by hosting sleep, server restarts or server moderation. Always-on hosting and anti-AFK cannot guarantee uninterrupted uptime.
