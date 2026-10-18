import type { SignalData } from "@/lib/types";

const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

type Peer = {
  connection: RTCPeerConnection;
  ice: RTCIceCandidateInit[];
  remoteReady: boolean;
};

export class VoiceMesh {
  userId = "";
  private peers = new Map<string, Peer>();
  private local: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gains = new Map<string, GainNode>();
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private mode: "activity" | "push" = "activity";
  private pushHeld = false;
  private muted = false;
  private deafened = false;
  private volumes = new Map<string, number>();
  private speaking = false;
  private frame = 0;
  private level = new Uint8Array(0);
  private buffering = true;
  private queue: { fromUserId: string; data: SignalData }[] = [];
  private processor: ScriptProcessorNode | null = null;
  private silence: GainNode | null = null;
  private nextPlay = 0;
  private hearing = new Set<string>();
  private heardTimers = new Map<string, number>();

  onSpeaking: (active: boolean) => void = () => {};
  onSignal: (toUserId: string, data: SignalData) => void = () => {};
  onPeerState: (userId: string, state: "connecting" | "connected" | "failed") => void = () => {};
  onAudioFrame: (frame: ArrayBuffer) => void = () => {};
  onHearing: (userId: string, hearing: boolean) => void = () => {};

  async start(userId: string) {
    this.userId = userId;
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new AudioCtx();
    await this.context.resume();
    const source = this.context.createMediaStreamSource(this.local);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.level = new Uint8Array(this.analyser.fftSize);
    this.watch();
    this.applySend();
    this.listen();
    await this.flushQueue();
  }

  get active() {
    return Boolean(this.local);
  }

  setMode(mode: "activity" | "push") {
    this.mode = mode;
    this.applySend();
    if (mode === "push" && !this.pushHeld) this.setSpeaking(false);
  }

  setPushHeld(held: boolean) {
    this.pushHeld = held;
    this.applySend();
    if (this.mode === "push") this.setSpeaking(held && !this.muted && !this.deafened);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applySend();
    if (muted) this.setSpeaking(false);
  }

  setDeafened(deafened: boolean) {
    this.deafened = deafened;
    this.applySend();
    for (const [id, gain] of this.gains) this.applyGain(id, gain);
    if (deafened) this.setSpeaking(false);
  }

  setVolume(userId: string, value: number) {
    this.volumes.set(userId, value);
    const gain = this.gains.get(userId);
    if (gain) this.applyGain(userId, gain);
  }

  setPeers(ids: string[]) {
    if (!this.local) return;
    const want = new Set(ids.filter((id) => id !== this.userId));
    for (const id of this.peers.keys()) {
      if (!want.has(id)) this.removePeer(id);
    }
    for (const id of want) {
      if (!this.peers.has(id)) void this.ensurePeer(id, this.userId > id);
    }
  }

  reset() {
    for (const id of [...this.peers.keys()]) this.removePeer(id);
  }

  async handleSignal(fromUserId: string, data: SignalData) {
    if (this.buffering || !this.local) {
      this.queue.push({ fromUserId, data });
      return;
    }
    await this.consumeSignal(fromUserId, data);
  }

  private async flushQueue() {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0);
      for (const item of batch) {
        await this.consumeSignal(item.fromUserId, item.data);
      }
    }
    this.buffering = false;
  }

  private async consumeSignal(fromUserId: string, data: SignalData) {
    const peer = await this.ensurePeer(fromUserId, false);
    if (data.kind === "offer") {
      await peer.connection.setRemoteDescription({ type: "offer", sdp: data.sdp });
      peer.remoteReady = true;
      await this.flushIce(peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      this.onSignal(fromUserId, { kind: "answer", sdp: answer.sdp ?? "" });
    } else if (data.kind === "answer") {
      await peer.connection.setRemoteDescription({ type: "answer", sdp: data.sdp });
      peer.remoteReady = true;
      await this.flushIce(peer);
    } else if (data.candidate) {
      if (!peer.remoteReady) peer.ice.push(data.candidate);
      else await peer.connection.addIceCandidate(data.candidate);
    }
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.reset();
    this.local?.getTracks().forEach((track) => track.stop());
    this.local = null;
    this.buffering = true;
    this.queue = [];
    this.processor?.disconnect();
    this.silence?.disconnect();
    this.processor = null;
    this.silence = null;
    this.nextPlay = 0;
    for (const timer of this.heardTimers.values()) window.clearTimeout(timer);
    this.heardTimers.clear();
    for (const id of this.hearing) this.onHearing(id, false);
    this.hearing.clear();
    void this.context?.close();
    this.context = null;
    this.analyser = null;
    this.speaking = false;
  }

  private applySend() {
    const send =
      !this.muted &&
      !this.deafened &&
      (this.mode === "activity" || this.pushHeld);
    this.local?.getAudioTracks().forEach((track) => {
      track.enabled = send;
    });
  }

  private watch() {
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(this.level);
      let sum = 0;
      for (const value of this.level) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / this.level.length);
      if (this.mode === "activity" && !this.muted && !this.deafened) {
        this.setSpeaking(rms > 0.045);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private setSpeaking(active: boolean) {
    if (active === this.speaking) return;
    this.speaking = active;
    this.onSpeaking(active);
  }

  private async ensurePeer(id: string, offer: boolean) {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const connection = new RTCPeerConnection({ iceServers });
    const peer: Peer = { connection, ice: [], remoteReady: false };
    this.peers.set(id, peer);
    this.local?.getTracks().forEach((track) => connection.addTrack(track, this.local as MediaStream));
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.onSignal(id, { kind: "ice", candidate: event.candidate.toJSON() });
      }
    };
    connection.ontrack = (event) => {
      const [remote] = event.streams;
      const stream = remote ?? new MediaStream([event.track]);
      this.attach(id, stream);
    };
    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      if (state === "connected") this.onPeerState(id, "connected");
      else if (state === "failed" || state === "disconnected") this.onPeerState(id, "failed");
      else this.onPeerState(id, "connecting");
    };
    this.onPeerState(id, "connecting");
    if (offer) {
      const description = await connection.createOffer();
      await connection.setLocalDescription(description);
      this.onSignal(id, { kind: "offer", sdp: description.sdp ?? "" });
    }
    return peer;
  }

  private async flushIce(peer: Peer) {
    const queued = peer.ice.splice(0);
    for (const candidate of queued) {
      await peer.connection.addIceCandidate(candidate);
    }
  }

  private listen() {
    if (!this.context || !this.local) return;
    const silence = this.context.createGain();
    silence.gain.value = 0;
    const processor = this.context.createScriptProcessor(2048, 1, 1);
    const source = this.context.createMediaStreamSource(this.local);
    processor.onaudioprocess = (event) => {
      const sending =
        !this.muted &&
        !this.deafened &&
        (this.mode === "activity" || this.pushHeld);
      if (!sending) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let index = 0; index < input.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
        pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      this.onAudioFrame(encodeAudio(this.userId, event.inputBuffer.sampleRate, pcm));
    };
    source.connect(processor);
    processor.connect(silence);
    silence.connect(this.context.destination);
    this.processor = processor;
    this.silence = silence;
  }

  play(frame: ArrayBuffer) {
    if (!this.context || this.deafened) return;
    const parsed = decodeAudio(frame);
    if (!parsed) return;
    const direct = this.peers.get(parsed.userId)?.connection.connectionState === "connected";
    if (direct) return;
    const audio = this.context.createBuffer(1, parsed.pcm.length, parsed.sampleRate);
    const channel = audio.getChannelData(0);
    for (let index = 0; index < parsed.pcm.length; index += 1) {
      channel[index] = (parsed.pcm[index] ?? 0) / 0x8000;
    }
    const node = this.context.createBufferSource();
    node.buffer = audio;
    const gain = this.context.createGain();
    gain.gain.value = this.volumes.get(parsed.userId) ?? 1;
    node.connect(gain);
    gain.connect(this.context.destination);
    const now = this.context.currentTime;
    if (this.nextPlay < now + 0.02) this.nextPlay = now + 0.08;
    node.start(this.nextPlay);
    this.nextPlay += audio.duration;
    this.markHearing(parsed.userId);
  }

  private markHearing(userId: string) {
    const existing = this.heardTimers.get(userId);
    if (existing) window.clearTimeout(existing);
    if (!this.hearing.has(userId)) {
      this.hearing.add(userId);
      this.onHearing(userId, true);
    }
    this.heardTimers.set(userId, window.setTimeout(() => {
      this.heardTimers.delete(userId);
      if (!this.hearing.delete(userId)) return;
      this.onHearing(userId, false);
    }, 1000));
  }

  private attach(id: string, stream: MediaStream) {
    if (!this.context) return;
    this.sources.get(id)?.disconnect();
    const source = this.context.createMediaStreamSource(stream);
    const gain = this.context.createGain();
    this.applyGain(id, gain);
    source.connect(gain);
    gain.connect(this.context.destination);
    this.sources.set(id, source);
    this.gains.set(id, gain);
  }

  private applyGain(id: string, gain: GainNode) {
    gain.gain.value = this.deafened ? 0 : (this.volumes.get(id) ?? 1);
  }

  private removePeer(id: string) {
    this.sources.get(id)?.disconnect();
    this.gains.get(id)?.disconnect();
    this.sources.delete(id);
    this.gains.delete(id);
    this.peers.get(id)?.connection.close();
    this.peers.delete(id);
    if (this.hearing.delete(id)) this.onHearing(id, false);
  }
}

function encodeAudio(userId: string, sampleRate: number, pcm: Int16Array) {
  const id = new TextEncoder().encode(userId).slice(0, 255);
  const packet = new Uint8Array(2 + id.length + 4 + pcm.byteLength);
  const view = new DataView(packet.buffer);
  packet[0] = 1;
  packet[1] = id.length;
  packet.set(id, 2);
  view.setUint32(2 + id.length, sampleRate, true);
  packet.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 2 + id.length + 4);
  return packet.buffer;
}

function decodeAudio(frame: ArrayBuffer) {
  const view = new DataView(frame);
  if (frame.byteLength < 8 || view.getUint8(0) !== 1) return null;
  const idLength = view.getUint8(1);
  const header = 2 + idLength + 4;
  if (idLength < 1 || frame.byteLength < header) return null;
  const userId = new TextDecoder().decode(new Uint8Array(frame, 2, idLength));
  const sampleRate = view.getUint32(2 + idLength, true);
  if (sampleRate < 8000 || sampleRate > 96000) return null;
  const bytes = new Uint8Array(frame, header);
  const even = bytes.byteLength - (bytes.byteLength % 2);
  if (even === 0) return null;
  const copy = new Uint8Array(even);
  copy.set(bytes.subarray(0, even));
  return { userId, sampleRate, pcm: new Int16Array(copy.buffer) };
}
