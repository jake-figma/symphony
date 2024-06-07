import {
  MAX_DISTANCE,
  PingMessage,
  messageIsPongMessage,
} from "../widget-src/shared";
import "./index.css";

// https://github.com/cwilso/metronome/blob/main/index.html
export class Metronome {
  context: AudioContext;
  currentBeat = 0;
  isPlaying = false;
  noteLength = 0.05; // length of "beep" (in seconds)
  onBeat: (any: any) => void;
  previousBeat = -1;
  queue: { time: number; note: number }[] = [];
  tempo = 90.0;
  timeLookahead = 25.0; // How frequently to call scheduling function
  timeNextNote = 0.0; // when the next note is due.
  timeScheduleAhead = 0.1; // How far ahead to schedule audio (sec) This is calculated from timeLookahead, and overlaps with next interval (in case the timer is late)
  unlocked = false;
  worker: Worker;

  constructor(context: AudioContext, onBeat: () => void) {
    this.onBeat = onBeat;
    this.context = context;
    const $worker = document.querySelector("#worker") as HTMLScriptElement;
    const blob = new Blob([$worker.textContent as string], {
      type: "text/javascript",
    });
    this.worker = new Worker(window.URL.createObjectURL(blob));
  }

  initialize() {
    requestAnimationFrame(this.tick.bind(this)); // start the drawing loop.

    this.worker.onmessage = (e) => {
      if (e.data == "tick") {
        this.scheduler();
      } else {
        console.log(`Message: ${e.data}`);
      }
    };
    this.worker.postMessage({ interval: this.timeLookahead });

    this.play();
  }

  tick() {
    requestAnimationFrame(this.tick.bind(this));
    let currentNote = this.previousBeat;
    if (this.context) {
      while (
        this.queue.length &&
        this.queue[0].time < this.context.currentTime
      ) {
        currentNote = this.queue[0].note;
        this.queue.splice(0, 1);
      }

      // We only step if the note has moved.
      if (this.previousBeat !== currentNote) {
        this.onBeat("WHAT!");
        this.previousBeat = currentNote;
      }
    }
  }

  nextNote() {
    // Advance current note and time by a 16th note...
    var secondsPerBeat = 60.0 / this.tempo; // Notice this picks up the CURRENT
    // tempo value to calculate beat length.
    this.timeNextNote += 0.25 * secondsPerBeat; // Add beat length to last beat time

    this.currentBeat++; // Advance the beat number, wrap to zero
    if (this.currentBeat == 16) {
      this.currentBeat = 0;
    }
  }

  scheduleNote(beatNumber: number, time: number) {
    // push the note on the this.queue, even if we're not playing.
    this.queue.push({ note: beatNumber, time: time });

    return null; // we're not making noise rn.

    // create an oscillator
    var osc = this.context.createOscillator();
    osc.connect(this.context.destination);
    if (beatNumber % 16 === 0)
      // beat 0 == high pitch
      osc.frequency.value = 880.0;
    else if (beatNumber % 4 === 0)
      // quarter notes = medium pitch
      osc.frequency.value = 440.0;
    // other 16th notes = low pitch
    else osc.frequency.value = 220.0;

    osc.start(time);
    osc.stop(time + this.noteLength);
  }

  scheduler() {
    // while there are notes that will need to play before the next interval,
    // schedule them and advance the pointer.
    while (
      this.timeNextNote <
      this.context.currentTime + this.timeScheduleAhead
    ) {
      this.scheduleNote(this.currentBeat, this.timeNextNote);
      this.nextNote();
    }
  }

  play() {
    if (!this.unlocked) {
      // play silent buffer to unlock the audio
      var buffer = this.context.createBuffer(1, 1, 22050);
      var node = this.context.createBufferSource();
      node.buffer = buffer;
      node.start(0);
      this.unlocked = true;
    }

    this.isPlaying = !this.isPlaying;

    if (this.isPlaying) {
      // start playing
      this.currentBeat = 0;
      this.timeNextNote = this.context.currentTime;
      this.worker.postMessage("start");
      return "stop";
    } else {
      this.worker.postMessage("stop");
      return "play";
    }
  }
}

type OscillatorMap = {
  [sessionOscillatorId: string]: {
    gain: GainNode;
    oscillator: OscillatorNode;
  };
};

console.clear();

let USE_PROXIMITY = false;
let USE_MULTIPLAYER = false;
let MUTE = true;
const beats = {
  step: 0,
  change: false,
  reset() {
    this.step = 0;
    this.change = false;
  },
  calc() {
    this.step++;
    this.change = true;
  },
};

const oscillators: OscillatorMap = {};

const $listening = document.getElementById("listening") as HTMLInputElement;
$listening.addEventListener("change", onListeningChange);
const $multiplayer = document.getElementById("multiplayer") as HTMLInputElement;
$multiplayer.addEventListener("change", onMultiplayerChange);
const $proximity = document.getElementById("proximity") as HTMLInputElement;
$proximity.addEventListener("change", onProximityChange);
const $rate = document.getElementById("rate") as HTMLInputElement;
$rate.addEventListener("input", onRateChange);
const $rateValue = document.getElementById("rate-value") as HTMLSpanElement;
const $tick = document.getElementById("tick") as HTMLSpanElement;
let context: AudioContext;
let metronome: Metronome;

onRateChange();
onProximityChange();
onMultiplayerChange();

function onMultiplayerChange() {
  USE_MULTIPLAYER = $multiplayer.checked;
}
function onProximityChange() {
  USE_PROXIMITY = $proximity.checked;
}
function onRateChange() {
  if (metronome) metronome.tempo = parseInt($rate.value);
  $rateValue.innerText = $rate.value;
}

async function onListeningChange() {
  MUTE = !$listening.checked;
  if (MUTE) {
    for (let sessionOscillatorId in oscillators) {
      const { gain, oscillator } = oscillators[sessionOscillatorId];
      gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.25);
      oscillator.stop(context.currentTime + 0.3);
      oscillator.addEventListener("ended", () => {
        gain.disconnect();
      });
      delete oscillators[sessionOscillatorId];
    }
    metronome.play();
    return;
  }
  $multiplayer.removeAttribute("disabled");
  $proximity.removeAttribute("disabled");
  $rate.removeAttribute("disabled");
  context = context || new AudioContext();

  metronome = new Metronome(context, () => {
    beats.calc();
    $tick.innerText = [
      (Math.floor(beats.step / 16) % 4) + 1,
      (Math.floor(beats.step / 4) % 4) + 1,
      (beats.step % 4) + 1,
    ].join(".");
    if (MUTE) {
      beats.reset();
    } else {
      const beat = { step: beats.step, change: beats.change };
      const pluginMessage: PingMessage = { type: "PING", beat };
      parent.postMessage(
        {
          pluginMessage,
          pluginId: "1365528382821091411",
        },
        "*"
      );
    }
  });
  metronome.initialize();
  metronome.tempo = parseInt($rate.value);

  window.onmessage = ({ data }) => {
    const message = data.pluginMessage;
    let nothing = true;
    if (messageIsPongMessage(message)) {
      const { currentSessionId, users } = message.payload;
      if (!currentSessionId) {
        return;
      }

      for (let sessionOscillatorId in oscillators) {
        const [sessionId, oscillatorId] = sessionOscillatorId.split("-");
        const existing = users[sessionId]?.oscillators[oscillatorId];
        if (existing) {
          // it does already exist and should be playing
        } else {
          const { gain, oscillator } = oscillators[sessionOscillatorId];
          gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.25);
          oscillator.stop(context.currentTime + 0.3);
          oscillator.addEventListener("ended", () => {
            gain.disconnect();
          });
          delete oscillators[sessionOscillatorId];
        }
      }
      const newOscillators: {
        [sessionOscillatorId: string]: {
          gain: GainNode;
          oscillator: OscillatorNode;
        };
      } = {};

      for (let sessionId in users) {
        if (USE_MULTIPLAYER || currentSessionId === sessionId) {
          for (let oscillatorId in users[sessionId].oscillators) {
            nothing = false;
            const sessionOscillatorId = sessionId + "-" + oscillatorId;
            const distance = USE_PROXIMITY
              ? users[sessionId]?.distances[oscillatorId]
              : 0;
            const loudnessFactor = 1 - Math.min(1, distance / MAX_DISTANCE);
            if (oscillators[sessionOscillatorId]) {
              // should be playing
              const { oscillator, gain } = oscillators[sessionOscillatorId];
              gain.gain.linearRampToValueAtTime(
                (oscillator.type === "square" ? 0.1 : 0.15) * loudnessFactor,
                context.currentTime + 0.05
              );
            } else {
              const { oscillators } = users[sessionId];
              const oscillator = context.createOscillator();
              const gain = context.createGain();
              gain.gain.value = 0;
              oscillator.frequency.value = oscillators[oscillatorId].frequency;
              oscillator.type = oscillators[oscillatorId].wave;
              oscillator.connect(gain);
              // Rests come in as frequency 0
              if (oscillators[oscillatorId].frequency > 0) {
                gain.gain.linearRampToValueAtTime(
                  (oscillator.type === "square" ? 0.1 : 0.15) * loudnessFactor,
                  context.currentTime + 0.125
                );
              }
              oscillator.start(context.currentTime);
              gain.connect(context.destination);
              newOscillators[sessionOscillatorId] = { oscillator, gain };
            }
          }
        }
      }
      Object.assign(oscillators, newOscillators);
      if (nothing) beats.reset();
    }
  };

  const pluginMessage: PingMessage = { type: "PING" };
  parent.postMessage(
    {
      pluginMessage,
      pluginId: "1365528382821091411",
    },
    "*"
  );
}
