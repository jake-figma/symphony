import {
  MAX_DISTANCE,
  PongMessagePayload,
  PongMessagePayloadOscillator,
  messageIsPingMessage,
} from "./shared";

const { currentPage, getNodeByIdAsync, widget } = figma;
const url = "http://localhost:8000";
const widgetId = "1365528382821091411";
const {
  AutoLayout,
  Frame,
  SVG,
  Text,
  useEffect,
  usePropertyMenu,
  useSyncedState,
  useWidgetNodeId,
} = widget;

const LOOP_MODE = true;
const NODE_DIAMETER = 160;
const NODE_FONT_SIZE = 30;

async function openUI() {
  return new Promise(() => {
    figma.showUI(
      `<script>window.location.href = "${url}?${Date.now()}"</script>`,
      {
        width: 200,
        height: 200,
      }
    );
  });
}

function Widget() {
  console.clear();

  useEffect(() => {
    figma.ui.onmessage = async (e) => {
      if (messageIsPingMessage(e)) {
        if (e.beat) await handleBeat(e.beat);
        figma.ui.postMessage({
          type: "PONG",
          payload: await getCurrentPayload(),
        });
      }
    };
  });

  async function handleBeat({
    step,
    change,
  }: {
    step: number;
    change: boolean;
  }): Promise<void> {
    if (!LOOP_MODE || !change) return;
    const nextNodes: SceneNode[] = [];
    await Promise.all(
      currentPage.selection.map(async (node) => {
        const starts = node.attachedConnectors.filter(
          (c) =>
            "endpointNodeId" in c.connectorStart &&
            c.connectorStart.endpointNodeId === node.id
        );
        for (let start of starts) {
          // option 1 is length of line.
          // const length = Math.floor((start.height + start.width) / 160); // should be multiple of 16 for shift nudge.
          // option 2 is length of characters.
          const length = start.text.characters.length + 1;
          // const beatIndex =
          //   start.connectorEndStrokeCap === "NONE"
          //     ? 4
          //     : [
          //         "CIRCLE_FILLED",
          //         "DIAMOND_FILLED",
          //         "TRIANGLE_FILLED",
          //         "ARROW_EQUILATERAL",
          //         "ARROW_LINES",
          //       ].indexOf(start.connectorEndStrokeCap);
          const next = await findNextNodeFromConnector(start);
          if (next && !nextNodes.includes(node)) {
            if (step % length === 0) {
              nextNodes.push(next);
            } else {
              nextNodes.push(node);
            }
          }
        }
      })
    );
    if (nextNodes.length) {
      figma.currentPage.selection = nextNodes;
    }
  }

  async function findNextNodeFromConnector(
    connector: ConnectorNode
  ): Promise<SceneNode | null> {
    return "endpointNodeId" in connector.connectorEnd
      ? ((await figma.getNodeByIdAsync(
          connector.connectorEnd.endpointNodeId
        )) as SceneNode | null)
      : null;
  }

  async function getCurrentPayload(): Promise<PongMessagePayload> {
    const widgets: { [k: string]: PongMessagePayloadOscillator } = {};
    currentPage.findWidgetNodesByWidgetId(widgetId).forEach((widget) => {
      const { mode, frequency, wave } = widget.widgetSyncedState;
      if (mode !== "symphony") {
        widgets[widget.id] = {
          frequency,
          wave,
          endpoints: widget.attachedConnectors.filter(
            (c) =>
              "endpointNodeId" in c.connectorStart &&
              c.connectorStart.endpointNodeId === widget.id
          ),
          parent: widget.parent?.id,
          id: widget.id,
          x: widget.absoluteBoundingBox?.x || 0 + widget.width * 0.5,
          y: widget.absoluteBoundingBox?.y || 0 + widget.height * 0.5,
        };
      }
    });
    const payload: PongMessagePayload = {
      currentSessionId: figma.currentUser?.sessionId.toString() || "",
      users: {},
      widgets,
    };
    const currentUser = figma.activeUsers.find(
      (user) => user.sessionId === figma.currentUser?.sessionId
    );

    const currentPosition = {
      x: currentUser?.position?.x || 0,
      y: currentUser?.position?.y || 0,
    };
    for (let user of figma.activeUsers) {
      const oscillators: {
        [oscillatorId: string]: PongMessagePayloadOscillator;
      } = {};
      const distances: { [oscillatorId: string]: number } = {};
      const processNode = (a: string) => {
        if (a in widgets) {
          oscillators[widgets[a].id] = widgets[a];
          distances[widgets[a].id] = Math.sqrt(
            Math.pow(widgets[a].x - currentPosition.x, 2) +
              Math.pow(widgets[a].y - currentPosition.y, 2)
          );
        }
      };
      for (let a of user.selection) {
        if (a in widgets) {
          processNode(a);
        } else {
          const node = await figma.getNodeByIdAsync(a);
          if (node && "children" in node) {
            node.children.forEach((n) => processNode(n.id));
          }
        }
      }
      payload.users[user.sessionId] = {
        sessionId: user.sessionId.toString(),
        user: user.name,
        position: user.position,
        oscillators,
        distances,
        selection: user.selection,
      };
    }
    return payload;
  }

  const widgetNodeId = useWidgetNodeId();
  const [mode] = useSyncedState("mode", "symphony");
  const [symphonyWave, setSymphonyWave] = useSyncedState(
    "symphony-wave",
    "sine"
  );
  const [symphonyOctave, setSymphonyOctave] = useSyncedState(
    "symphony-octave",
    4
  );
  const [frequency] = useSyncedState("frequency", 0);
  const [octave] = useSyncedState("octave", 3);
  const [note] = useSyncedState("note", "undefined");
  const [step] = useSyncedState("step", 0);
  const [wave] = useSyncedState("wave", "undefined");

  usePropertyMenu(
    mode === "symphony"
      ? [
          {
            propertyName: "open",
            itemType: "action",
            tooltip: "Listen",
          },
          {
            propertyName: "all",
            itemType: "action",
            tooltip: "All",
          },
        ]
      : [],
    async (e) => {
      if (e.propertyName === "open") await openUI();
      else if (e.propertyName === "all") await generateAll();
    }
  );

  // const octaves = [1, 2, 3, 4, 5, 6];
  const octaves = [2, 3, 4];
  const notes = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const waves = ["sine", "triangle", "sawtooth", "square"];

  async function generateAll() {
    const widgetNode = (await getNodeByIdAsync(widgetNodeId)) as WidgetNode;
    const gap = MAX_DISTANCE;
    const startX = widgetNode.x;
    const startY = widgetNode.y + widgetNode.height + gap;
    const selection: SceneNode[] = [];
    await Promise.all(
      [...octaves].reverse().map(
        async (octave, octaveY) =>
          await Promise.all(
            [...waves].reverse().map(
              async (wave, waveY) =>
                await Promise.all(
                  notes.map(async (note, i) => {
                    const node = await handleNoteClick(
                      note,
                      i,
                      octave,
                      wave,
                      widgetNode,
                      true
                    );
                    if (node) {
                      node.x = startX + i * (NODE_DIAMETER + gap);
                      node.y =
                        startY +
                        waveY * (NODE_DIAMETER + gap) +
                        octaveY * waves.length * (NODE_DIAMETER + gap);
                      selection.push(node);
                    }
                  })
                )
            )
          )
      )
    );
    figma.currentPage.selection = selection;
  }

  async function handleNoteClick(
    note: string,
    step: number,
    octave: number,
    wave: string,
    widgetNode?: WidgetNode,
    oneOff = false
  ): Promise<null | WidgetNode> {
    widgetNode =
      widgetNode || ((await getNodeByIdAsync(widgetNodeId)) as WidgetNode);
    if (!widgetNode) {
      return null;
    }
    const clone = widgetNode.cloneWidget({
      mode: "sound",
      frequency: frequencyFromOctaveAndStep(octave, step),
      note,
      octave,
      step,
      wave,
    });
    if (!oneOff) {
      clone.y = widgetNode.y + widgetNode.height + 10;
      currentPage.selection = [clone];
      await openUI();
    }
    return clone;
  }

  if (mode === "symphony") {
    const gap = 8;
    const width = 40;
    const pad = 10;
    const heightBlack = 120;
    const heightWhite = 200;
    return (
      <AutoLayout
        direction="vertical"
        cornerRadius={20}
        fill="#f9f9f9"
        stroke="#EEE"
        strokeWidth={8}
        strokeAlign="outside"
        padding={20}
        spacing={20}
        horizontalAlignItems="center"
      >
        <Frame
          cornerRadius={16}
          fill="#eee"
          height={heightWhite + pad + pad}
          width={width * 7 + gap * (7 - 1) + pad + pad}
        >
          {notes.map((note, i) => {
            const index = [0, 2, 4, 5, 7, 9, 11].indexOf(i);
            return index !== -1 ? (
              <AutoLayout
                key={note}
                y={pad}
                x={pad + index * width + index * gap}
                cornerRadius={{
                  bottomLeft: 12,
                  bottomRight: 12,
                  topLeft: i === 0 ? 12 : 0,
                  topRight: i === notes.length - 1 ? 12 : 0,
                }}
                direction="vertical"
                fill={note.match("#") ? "#000" : "#FFF"}
                verticalAlignItems="center"
                horizontalAlignItems="center"
                onClick={() =>
                  handleNoteClick(note, i, symphonyOctave, symphonyWave)
                }
                hoverStyle={{ opacity: 0.7 }}
                height={note.match("#") ? heightBlack : heightWhite}
                width={width}
              />
            ) : null;
          })}
          {notes.map((note, i) => {
            const index = [1, 3, 6, 8, 10].indexOf(i);
            const offset = index > 1 ? width + gap : 0;
            return index !== -1 ? (
              <AutoLayout
                key={note}
                y={pad}
                x={pad + index * (width + gap) + offset + width / 2 + pad / 2}
                cornerRadius={{
                  bottomLeft: 12,
                  bottomRight: 12,
                  topLeft: i === 0 ? 12 : 0,
                  topRight: i === notes.length - 1 ? 12 : 0,
                }}
                direction="vertical"
                fill={note.match("#") ? "#000" : "#FFF"}
                verticalAlignItems="center"
                horizontalAlignItems="center"
                onClick={() =>
                  handleNoteClick(note, i, symphonyOctave, symphonyWave)
                }
                hoverStyle={{ fill: "#333" }}
                height={note.match("#") ? heightBlack : heightWhite}
                width={width}
              />
            ) : null;
          })}
        </Frame>
        <AutoLayout
          direction="horizontal"
          width="fill-parent"
          cornerRadius={16}
          spacing={2}
        >
          {octaves.map((octave, i) => (
            <AutoLayout
              key={octave}
              direction="vertical"
              fill={octave === symphonyOctave ? "#000" : "#eee"}
              cornerRadius={{
                topLeft: i === 0 ? 12 : 0,
                bottomLeft: i === 0 ? 12 : 0,
                topRight: i === octaves.length - 1 ? 12 : 0,
                bottomRight: i === octaves.length - 1 ? 12 : 0,
              }}
              padding={20}
              onClick={() => setSymphonyOctave(octave)}
              horizontalAlignItems="center"
              width="fill-parent"
            >
              <Text
                fontSize={30}
                fontWeight="black"
                fill={octave === symphonyOctave ? "#fff" : "#000"}
              >
                {octave}
              </Text>
            </AutoLayout>
          ))}
        </AutoLayout>
        <AutoLayout
          direction="horizontal"
          width="fill-parent"
          cornerRadius={16}
          spacing={2}
        >
          {waves.map((wave, i) => (
            <AutoLayout
              key={wave}
              direction="vertical"
              fill={wave === symphonyWave ? "#000" : "#eee"}
              padding={20}
              horizontalAlignItems="center"
              cornerRadius={{
                topLeft: i === 0 ? 12 : 0,
                bottomLeft: i === 0 ? 12 : 0,
                topRight: i === waves.length - 1 ? 12 : 0,
                bottomRight: i === waves.length - 1 ? 12 : 0,
              }}
              width="fill-parent"
              onClick={() => setSymphonyWave(wave)}
            >
              <SVG
                src={svgFromWave(wave, wave === symphonyWave ? "#fff" : "#000")}
              />
            </AutoLayout>
          ))}
        </AutoLayout>
      </AutoLayout>
    );
  } else if (mode === "sound") {
    return (
      <AutoLayout
        verticalAlignItems="center"
        horizontalAlignItems="center"
        direction="vertical"
        height={NODE_DIAMETER}
        width={NODE_DIAMETER}
      >
        <SVG
          src={svgShapeFromWave(
            wave,
            fillFromStepAndOctave(step, octave, "99"),
            fillFromStepAndOctave(step, octave, "dd")
          )}
          height={NODE_DIAMETER}
          width={NODE_DIAMETER}
          positioning="absolute"
          x={0}
          y={0}
          effect={{
            type: "drop-shadow",
            blur: 4,
            color: { r: 0, g: 0, b: 0, a: 0.1 },
            offset: { x: 0, y: 2 },
          }}
        />
        <Text
          fontWeight="extra-bold"
          fontSize={NODE_FONT_SIZE}
          fill="#fff"
          positioning="absolute"
          horizontalAlignText="center"
          verticalAlignText="center"
          x={wave === "sawtooth" ? NODE_FONT_SIZE : 0}
          y={
            wave === "sawtooth" || wave === "triangle"
              ? NODE_DIAMETER - NODE_FONT_SIZE * 2
              : NODE_DIAMETER * 0.5 - NODE_FONT_SIZE * 0.5
          }
          width={NODE_DIAMETER}
          effect={{
            type: "drop-shadow",
            blur: 4,
            color: { r: 0, g: 0, b: 0, a: 0.1 },
            offset: { x: 0, y: 2 },
          }}
        >
          {note}
          {octave}
        </Text>
      </AutoLayout>
    );
  }
}
widget.register(Widget);

function svgFromWave(wave: string, fill: string) {
  let path = {
    sawtooth: `<path d="M5 20L25 10V19.906" />`,
    sine: `<path d="M5.76935 15.0328C7.75644 8.39307 13.9562 8.28772 15.7693 14.9274C17.5825 21.567 24.1912 21.7778 25.7693 15.0328"/>`,
    square: `<path d="M5 20.0073V10.0073H15V19.8807H25" />`,
    triangle: `<path d="M5.76935 20.0073L15.8166 10.0073L25.7693 19.9133" />`,
  }[wave];
  return `<svg viewBox="0 5 30 20" height="60" width="60" stroke="${fill}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">${path}</svg>`;
}

function svgShapeFromWave(wave: string, fill: string, stroke: string) {
  let path = {
    sawtooth: `<path d="M5 95L95 5,95 95Z" />`,
    sine: `<circle cx="50" cy="50" r="45" />`,
    square: `<rect x="5" y="5" width="90" height="90" />`,
    triangle: `<path d="M5 95L95 95,50 5Z" />`,
  }[wave];
  return `<svg viewBox="0 0 100 100" height="100" width="100" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function frequencyFromOctaveAndStep(octave: number, step: number) {
  const semitonesFromA4 = (octave - 4) * 12 + step - 9;
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

function hslToHex(h: number, s: number, l: number, opacity = "FF") {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}${opacity}`;
}

function fillFromStepAndOctave(step: number, octave: number, opacity = "FF") {
  return hslToHex(
    Math.round(step ? (step / 11) * 360 : 0),
    100,
    (octave ? octave / 8 : 0) * 50 + 10,
    opacity
  );
}
