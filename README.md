# JojoTeams

JojoTeams is a voice house. You create an account, open a house, and share a short code. People stand in rooms, talk, and write. The layout is a floor of rooms and a stage of people, not a classic server-admin tree.

## Stack

- Next.js and React for the interface
- Express and `ws` for presence, chat, and WebRTC signaling
- Better Auth for email and password accounts
- Prisma and PostgreSQL for houses, rooms, and messages
- shadcn/ui and Tailwind for the interface

Voice uses a WebRTC mesh with a public STUN server. Rooms are comfortable up to about six people. Chat and presence still work when a network blocks the audio path. There is no TURN relay, so some strict networks will connect the house but not the microphone.

## Run it locally

1. Start PostgreSQL. With Docker:

```bash
docker compose up -d
```

Or create the same role and database yourself:

```bash
createuser jojoteams --pwprompt
createdb jojoteams --owner=jojoteams
```

The default URL is `postgresql://jojoteams:jojoteams@127.0.0.1:5432/jojoteams`.

2. Configure the app:

```bash
cp .env.example .env
```

Set `BETTER_AUTH_SECRET` to a long random value (`openssl rand -base64 32`) and set `INTERNAL_SECRET` to another random string.

3. Install, migrate, and start both processes:

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847). The realtime server listens on port `3848`.

Create an account, open a house, and copy the code. A second browser profile with another account can join that code. Open the microphone in each window, stand in the same room, and talk. Hold Space when the control is set to hold-to-talk.

## What you can do

- Sign up and sign in
- Open a house, set a welcome line, and optionally lock it with a password
- Share the invite code
- Add, rename, nest, reorder, and remove rooms
- Cap a room and give it a password
- Move between rooms and see who is standing where
- Mute, deafen, mark yourself away, and switch between voice activity and hold-to-talk
- Set another person's volume
- Write in the room, or whisper to one person
- Walk someone out if you are the host

Permission groups, file transfer, a public server directory, avatars, and positional audio are not in this version.
