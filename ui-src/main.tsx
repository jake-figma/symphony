import {
  MAX_DISTANCE,
  PingMessage,
  messageIsPongMessage,
} from "../widget-src/shared";
import "./index.css";
import { Metronome } from "./metronome";

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
    const beat = { step: beats.step, change: beats.change };
    const pluginMessage: PingMessage = { type: "PING", beat };
    if (MUTE) {
      beats.reset();
    } else {
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
