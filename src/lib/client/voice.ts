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

  onSpeaking: (active: boolean) => void = () => {};
  onSignal: (toUserId: string, data: SignalData) => void = () => {};
  onPeerState: (userId: string, state: "connecting" | "connected" | "failed") => void = () => {};

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
    if (!this.local) return;
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
      const stream = event.streams[0];
      if (stream) this.attach(id, stream);
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
  }
}
