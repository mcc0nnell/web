/**
 * GLADcast broadcast outputs.
 *
 * Everything downstream of the program canvas:
 *   - pop-out clean program window (fullscreen it on a stage screen, or
 *     window-capture it in OBS / a hardware scan converter for HDMI/SDI)
 *   - WebM recording via MediaRecorder (canvas captureStream)
 *   - PNG frame grabs / image sequences
 *   - aspect presets: 16:9, 9:16, 1:1, ultrawide stage canvas
 *
 * NDI / Syphon / Spout / ProRes-with-alpha require a native host and are
 * documented as integration points in the README, not faked here.
 */

export const ASPECTS = {
  '16:9': { w: 1280, h: 720, label: '16:9 · 1280×720' },
  '16:9 HD': { w: 1920, h: 1080, label: '16:9 · 1920×1080' },
  '9:16': { w: 720, h: 1280, label: '9:16 · 720×1280' },
  '1:1': { w: 1080, h: 1080, label: '1:1 · 1080×1080' },
  'ultrawide': { w: 2560, h: 720, label: 'stage · 2560×720' },
};

export class OutputManager {
  constructor(programCanvas) {
    this.programCanvas = programCanvas;
    this.popout = null;
    this.recorder = null;
    this.recording = false;
    this.fps = 30;
  }

  /** Clean program feed in its own window — capture or fullscreen it. */
  openProgramWindow() {
    if (this.popout && !this.popout.closed) { this.popout.focus(); return; }
    const w = window.open('', 'gladcast-program', 'width=960,height=540');
    if (!w) return;
    w.document.title = 'GLADcast — PROGRAM';
    w.document.body.style.cssText = 'margin:0;background:#000;display:grid;place-items:center;height:100vh;';
    const c = w.document.createElement('canvas');
    c.style.cssText = 'max-width:100vw;max-height:100vh;';
    w.document.body.appendChild(c);
    this.popout = w;
    this.popoutCanvas = c;
  }

  /** Called once per frame after the program canvas is composed. */
  tick() {
    if (this.popout && !this.popout.closed && this.popoutCanvas) {
      const src = this.programCanvas;
      if (this.popoutCanvas.width !== src.width) {
        this.popoutCanvas.width = src.width;
        this.popoutCanvas.height = src.height;
      }
      this.popoutCanvas.getContext('2d').drawImage(src, 0, 0);
    }
  }

  startRecording() {
    if (this.recording) return;
    const stream = this.programCanvas.captureStream(this.fps);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((m) => MediaRecorder.isTypeSupported(m)) || '';
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      this.download(URL.createObjectURL(blob), `gladcast-${this.stamp()}.webm`);
    };
    this.recorder.start(1000);
    this.recording = true;
  }

  stopRecording() {
    if (!this.recording) return;
    this.recorder.stop();
    this.recording = false;
  }

  snapshot() {
    this.download(this.programCanvas.toDataURL('image/png'), `gladcast-${this.stamp()}.png`);
  }

  download(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  }

  stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }
}
