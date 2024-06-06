import {
  MAX_DISTANCE,
  PingMessage,
  messageIsPongMessage,
} from "../widget-src/shared";
import "./index.css";

type OscillatorMap = {
  [sessionOscillatorId: string]: {
    gain: GainNode;
    oscillator: OscillatorNode;
  };
};

let USE_PROXIMITY = false;
let USE_MULTIPLAYER = false;
let MUTE = true;
const beats = {
  rate: 10,
  inc: 0,
  step: 0,
  change: false,
  calc() {
    if (this.inc % this.rate === 0) {
      this.step++;
      this.change = true;
    } else {
      this.change = false;
    }
    this.inc++;
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
let context: AudioContext;

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
  beats.rate =
    parseInt($rate.getAttribute("max") || "20") + 1 - parseInt($rate.value);
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
    return;
  }
  $multiplayer.removeAttribute("disabled");
  $proximity.removeAttribute("disabled");
  $rate.removeAttribute("disabled");
  context = context || new AudioContext();

  window.onmessage = ({ data }) => {
    const message = data.pluginMessage;
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
              oscillator.frequency.value = oscillators[oscillatorId].frequency;
              oscillator.type = oscillators[oscillatorId].wave;
              oscillator.connect(gain);
              gain.gain.value = 0;
              gain.gain.linearRampToValueAtTime(
                (oscillator.type === "square" ? 0.1 : 0.15) * loudnessFactor,
                context.currentTime + 0.125
              );
              oscillator.start(context.currentTime);
              gain.connect(context.destination);
              newOscillators[sessionOscillatorId] = { oscillator, gain };
            }
          }
        }
      }
      Object.assign(oscillators, newOscillators);
      beats.calc();
      const beat = { step: beats.step, change: beats.change };
      const pluginMessage: PingMessage = { type: "PING", beat };
      setTimeout(() => {
        if (!MUTE) {
          parent.postMessage(
            {
              pluginMessage,
              pluginId: "1365528382821091411",
            },
            "*"
          );
        }
      }, 50);
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
