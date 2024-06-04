import { PongMessage, MAX_DISTANCE } from "../widget-src/shared";
import "./index.css";

function messageIsPongMessage(
  message: any | PongMessage
): message is PongMessage {
  return message.type === "PONG";
}

type OscillatorMap = {
  [sessionOscillatorId: string]: {
    gain: GainNode;
    oscillator: OscillatorNode;
  };
};

const $start = document.getElementById("start");
$start?.addEventListener("click", initialize);

const USE_PROXIMITY = false;
const USE_MULTIPLAYER = false;
const beats = {
  rate: 2,
  step: 0,
  calc() {
    let is1st = this.step % (this.rate * 16) === 0;
    let is2nd = this.step % (this.rate * 8) === 0;
    let is4th = this.step % (this.rate * 4) === 0;
    let is8th = this.step % (this.rate * 2) === 0;
    let is16th = this.step % this.rate === 0;
    this.step++;
    return [
      is1st ? 1 : 0,
      is2nd ? 1 : 0,
      is4th ? 1 : 0,
      is8th ? 1 : 0,
      is16th ? 1 : 0,
    ].join("");
  },
};

async function initialize() {
  $start?.remove();
  const oscillators: OscillatorMap = {};
  const context = new AudioContext();
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
      let beat = beats.calc();
      setTimeout(() => {
        parent.postMessage(
          {
            pluginMessage: { type: "PING", beat },
            pluginId: "1365528382821091411",
          },
          "*"
        );
      }, 50);
    }
  };

  parent.postMessage(
    {
      pluginMessage: { type: "PING" },
      pluginId: "1365528382821091411",
    },
    "*"
  );
}
