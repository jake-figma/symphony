import {
  PongMessagePayload,
  PongMessagePayloadOscillator,
  messageIsPingMessage,
} from "./shared";

const { currentPage, getNodeByIdAsync, widget } = figma;
// const url = "http://localhost:8000";
const url: string = "https://jake-figma.github.io/symphony/";
if (url === "http://localhost:8000") {
  figma.notify("This is pointed to localhost", { error: true });
}
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

type Combo = "one" | "maj" | "min";

const LOOP_MODE = true;
const NODE_DIAMETER = 160;
const NODE_FONT_SIZE = 30;

async function openUI() {
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  return new Promise(() => {
    figma.showUI(
      `<script>window.location.href = "${url}?${Date.now()}"</script>`,
      {
        width: 140,
        height: 160,
      }
    );
  });
}

function Widget() {
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
    let selection: SceneNode[] = [];
    figma.on("selectionchange", () => {
      if (figma.currentPage.selection.length) {
        selection.splice(0, selection.length);
        selection.push(...figma.currentPage.selection);
      } else {
        selection.forEach((node) => {
          if (node && !node.removed) {
            const starts = node.attachedConnectors.filter(
              (c) =>
                "endpointNodeId" in c.connectorStart &&
                c.connectorStart.endpointNodeId === node.id
            );
            for (let start of starts) {
              if (start) {
                const match = start.text.characters.match(/^(\d+)(:(\d+))?$/);
                const [_match, length] = match || ["", "1"];
                start.text.characters = length;
              }
            }
          }
        });
      }
    });
  });

  async function handleBeat({
    step: _step,
    change,
  }: {
    step: number;
    change: boolean;
  }): Promise<void> {
    if (!LOOP_MODE || !change) return;
    const nextNodes: SceneNode[] = [];
    await Promise.all(
      currentPage.selection.map(async (node) => {
        if (node && !node.removed) {
          const starts = node.attachedConnectors.filter(
            (c) =>
              "endpointNodeId" in c.connectorStart &&
              c.connectorStart.endpointNodeId === node.id
          );
          if (starts.length) {
            for (let start of starts) {
              const match = start.text.characters.match(/^(\d+)(:(\d+))?$/);
              // asdf
              const [_match, length, _colon, position = "1"] = match || [
                "",
                "1",
                ":",
                "1",
              ];
              const next = await findNextNodeFromConnector(start);
              if (next) {
                const pos = parseInt(position);
                const len = parseInt(length);
                if (pos >= len) {
                  start.text.characters = length;
                  nextNodes.push(next);
                } else {
                  start.text.characters = `${length}:${pos + 1}`;
                  if (!nextNodes.includes(node)) nextNodes.push(node);
                }
              }
            }
          } else if (!nextNodes.includes(node)) {
            nextNodes.push(node);
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
      if (mode !== "symphony" && widget) {
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
  const [symphonyCombo, setSymphonyCombo] = useSyncedState<Combo>(
    "symphony-combo",
    "one"
  );
  const [frequency] = useSyncedState("frequency", 0);
  const [octave] = useSyncedState("octave", 3);
  const [note] = useSyncedState("note", "undefined");
  const [step] = useSyncedState("step", 0);
  const [wave] = useSyncedState("wave", "undefined");
  const [version] = useSyncedState("version", "1.2");
  const [showInfo, setShowInfo] = useSyncedState("show-info", false);

  const octaves = [1, 2, 3, 4, 5, 6];
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
  const combos: Combo[] = ["one", "maj", "min"];
  const comboLabels: { [K in Combo]: string } = {
    one: "Note",
    maj: "Major",
    min: "Minor",
  };

  usePropertyMenu(
    mode === "symphony"
      ? [
          // {
          //   propertyName: "update",
          //   itemType: "action",
          //   tooltip: "Update",
          // },
        ]
      : [],
    async (e) => {
      if (e.propertyName === "update") await updateWidgets();
    }
  );

  async function updateWidgets() {
    const widgets = figma.currentPage.findWidgetNodesByWidgetId(widgetId);
    // figma.currentPage.selection = widgets;

    widgets.forEach((widget) =>
      widget.setWidgetSyncedState({ ...widget.widgetSyncedState, version })
    );
  }

  async function handleRestClick() {
    const widgetNode = (await getNodeByIdAsync(widgetNodeId)) as WidgetNode;
    if (!widgetNode) {
      return null;
    }
    const clone = widgetNode.cloneWidget({
      mode: "rest",
      frequency: 0,
      octave: 0,
      note: "REST",
      step: 0,
      wave: "sine",
    });
    clone.y = widgetNode.y + widgetNode.height + 10;
    currentPage.selection = [clone];
  }

  async function handleNoteClick(
    note: string,
    step: number,
    octave: number,
    wave: string,
    combo: "one" | "maj" | "min",
    widgetNode?: WidgetNode,
    oneOff = false
  ): Promise<null | WidgetNode | SectionNode> {
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
    if (combo === "one") {
      if (!oneOff) {
        clone.y = widgetNode.y + widgetNode.height + 10;
        currentPage.selection = [clone];
        await openUI();
      }
      return clone;
    } else {
      const sectionGap = 50;
      const section = figma.createSection();
      const sectionX = widgetNode.x;
      const sectionY = widgetNode.y + widgetNode.height + sectionGap;
      section.resizeWithoutConstraints(
        NODE_DIAMETER * 3 + sectionGap * 4,
        NODE_DIAMETER + sectionGap * 2
      );
      const thirdIndex = (step + (combo === "maj" ? 4 : 3)) % notes.length;
      const third = (await handleNoteClick(
        notes[thirdIndex],
        thirdIndex,
        octave,
        wave,
        "one",
        widgetNode,
        true
      )) as WidgetNode;
      const fifthIndex = (step + 7) % notes.length;
      const fifth = (await handleNoteClick(
        notes[fifthIndex],
        fifthIndex,
        octave,
        wave,
        "one",
        widgetNode,
        true
      )) as WidgetNode;
      section.x = sectionX;
      section.y = sectionY;
      section.name = `${note} ${symphonyCombo}`;
      section.appendChild(clone);
      section.appendChild(third);
      section.appendChild(fifth);
      clone.x = sectionGap;
      clone.y = sectionGap;
      third.x = sectionGap + NODE_DIAMETER + sectionGap;
      third.y = sectionGap;
      fifth.x =
        sectionGap + NODE_DIAMETER + sectionGap + NODE_DIAMETER + sectionGap;
      fifth.y = sectionGap;
      return section;
    }
  }

  if (mode === "symphony") {
    const keyGap = 8;
    const keyWidth = 40;
    const pad = 20;
    const heightBlack = 120;
    const heightWhite = 210;
    const buttonHeight = 60;
    const keyCorner = 12;
    const keyCornerOff = 4;

    const infoText = (text: string) =>
      showInfo && (
        <AutoLayout padding={{ bottom: 20 }} width="fill-parent">
          <Text
            fill="#999"
            italic
            fontSize={20}
            width="fill-parent"
            horizontalAlignText="center"
          >
            {text}
          </Text>
        </AutoLayout>
      );

    const propsBlackButton: Partial<AutoLayoutProps> = {
      fill: "#000",
      horizontalAlignItems: "center",
      verticalAlignItems: "center",
      cornerRadius: buttonHeight,
      hoverStyle: { fill: "#222" },
      height: buttonHeight,
      width: buttonHeight,
    };
    const propsRangeButton = (
      active: boolean,
      index: number,
      lastIndex: number
    ): Partial<AutoLayoutProps> => ({
      fill: active ? "#000" : "#eee",
      hoverStyle: active ? {} : { fill: "#ddd" },
      cornerRadius: {
        topLeft: index === 0 ? buttonHeight / 2 : 0,
        bottomLeft: index === 0 ? buttonHeight / 2 : 0,
        topRight: index === lastIndex ? buttonHeight / 2 : 0,
        bottomRight: index === lastIndex ? buttonHeight / 2 : 0,
      },
      padding: {
        right: index === lastIndex ? buttonHeight / 8 : 0,
        left: index === 0 ? buttonHeight / 8 : 0,
      },
      height: buttonHeight * 0.8,
      verticalAlignItems: "center",
      horizontalAlignItems: "center",
      width: "fill-parent",
    });
    const propsBlackButtonText: Partial<TextProps> = {
      fontSize: 20,
      fontWeight: "black",
      fill: "#FFF",
    };
    const propsRangeText = (active: boolean): Partial<TextProps> => ({
      fontSize: 20,
      fontWeight: "black",
      fill: active ? "#fff" : "#000",
    });
    const spacingGap = 20;
    const iconDimension = 24;

    return (
      <AutoLayout
        direction="vertical"
        cornerRadius={buttonHeight / 2 + 30}
        fill={url === "http://localhost:8000" ? "#F00" : "#f9f9f9"}
        stroke="#EEE"
        strokeWidth={8}
        strokeAlign="inside"
        padding={30}
        spacing={spacingGap}
        horizontalAlignItems="center"
      >
        <Frame
          cornerRadius={buttonHeight / 2}
          fill="#eee"
          height={heightWhite + pad + pad}
          width={keyWidth * 7 + keyGap * (7 - 1) + pad + pad}
        >
          {notes.map((note, i) => {
            const index = [0, 2, 4, 5, 7, 9, 11].indexOf(i);
            return index !== -1 ? (
              <AutoLayout
                key={note}
                y={pad}
                x={pad + index * keyWidth + index * keyGap}
                cornerRadius={{
                  bottomLeft: keyCorner,
                  bottomRight: keyCorner,
                  topLeft: i === 0 ? keyCorner : keyCornerOff,
                  topRight: i === notes.length - 1 ? keyCorner : keyCornerOff,
                }}
                direction="vertical"
                fill={note.match("#") ? "#000" : "#FFF"}
                verticalAlignItems="center"
                horizontalAlignItems="center"
                onClick={() =>
                  handleNoteClick(
                    note,
                    i,
                    symphonyOctave,
                    symphonyWave,
                    symphonyCombo
                  )
                }
                // hoverStyle={{ fill: note.match("#") ? "#222" : "#ddd" }}
                hoverStyle={{ fill: fillFromStepAndOctave(i, 5) }}
                height={note.match("#") ? heightBlack : heightWhite}
                width={keyWidth}
              />
            ) : null;
          })}
          {notes.map((note, i) => {
            const index = [1, 3, 6, 8, 10].indexOf(i);
            const offset = index > 1 ? keyWidth + keyGap : 0;
            return index !== -1 ? (
              <AutoLayout
                key={note}
                y={pad}
                x={
                  pad +
                  index * (keyWidth + keyGap) +
                  offset +
                  keyWidth / 2 +
                  pad / 2
                }
                cornerRadius={{
                  bottomLeft: keyCorner,
                  bottomRight: keyCorner,
                  topLeft: i === 0 ? keyCorner : keyCornerOff,
                  topRight: i === notes.length - 1 ? keyCorner : keyCornerOff,
                }}
                direction="vertical"
                fill={note.match("#") ? "#000" : "#FFF"}
                verticalAlignItems="center"
                horizontalAlignItems="center"
                onClick={() =>
                  handleNoteClick(
                    note,
                    i,
                    symphonyOctave,
                    symphonyWave,
                    symphonyCombo
                  )
                }
                // hoverStyle={{ fill: "#333" }}
                hoverStyle={{ fill: fillFromStepAndOctave(i, 5) }}
                height={note.match("#") ? heightBlack : heightWhite}
                width={keyWidth}
              />
            ) : null;
          })}
        </Frame>
        {infoText("Select note to create nodes")}

        <AutoLayout width="fill-parent" spacing={2}>
          {octaves.map((octave, i) => (
            <AutoLayout
              key={octave}
              onClick={() => setSymphonyOctave(octave)}
              {...propsRangeButton(
                octave === symphonyOctave,
                i,
                octaves.length - 1
              )}
            >
              <Text {...propsRangeText(octave === symphonyOctave)}>
                {octave}
              </Text>
            </AutoLayout>
          ))}
        </AutoLayout>
        {infoText("Octaves change pitch")}
        <AutoLayout width="fill-parent" spacing={2}>
          {waves.map((wave, i) => (
            <AutoLayout
              key={wave}
              onClick={() => setSymphonyWave(wave)}
              {...propsRangeButton(wave === symphonyWave, i, waves.length - 1)}
            >
              <SVG
                src={svgFromWave(wave, wave === symphonyWave ? "#fff" : "#000")}
              />
            </AutoLayout>
          ))}
        </AutoLayout>
        {infoText("Waveforms change tone")}
        <AutoLayout cornerRadius={12} spacing={2} width="fill-parent">
          {combos.map((combo, i) => (
            <AutoLayout
              key={combo}
              onClick={() => setSymphonyCombo(combo)}
              {...propsRangeButton(
                combo === symphonyCombo,
                i,
                combos.length - 1
              )}
            >
              <Text {...propsRangeText(combo === symphonyCombo)}>
                {comboLabels[combo]}
              </Text>
            </AutoLayout>
          ))}
        </AutoLayout>
        {infoText("Note or Triad")}
        <AutoLayout spacing={spacingGap} width="fill-parent">
          <AutoLayout {...propsBlackButton} onClick={() => handleRestClick()}>
            <Text {...propsBlackButtonText}>R</Text>
          </AutoLayout>
          <AutoLayout
            {...propsBlackButton}
            spacing={10}
            width="fill-parent"
            onClick={async () => await openUI()}
          >
            <SVG
              src={`<svg width="${iconDimension}" height="${iconDimension}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 36V24C6 19.2261 7.89642 14.6477 11.2721 11.2721C14.6477 7.89642 19.2261 6 24 6C28.7739 6 33.3523 7.89642 36.7279 11.2721C40.1036 14.6477 42 19.2261 42 24V36M42 38C42 39.0609 41.5786 40.0783 40.8284 40.8284C40.0783 41.5786 39.0609 42 38 42H36C34.9391 42 33.9217 41.5786 33.1716 40.8284C32.4214 40.0783 32 39.0609 32 38V32C32 30.9391 32.4214 29.9217 33.1716 29.1716C33.9217 28.4214 34.9391 28 36 28H42V38ZM6 38C6 39.0609 6.42143 40.0783 7.17157 40.8284C7.92172 41.5786 8.93913 42 10 42H12C13.0609 42 14.0783 41.5786 14.8284 40.8284C15.5786 40.0783 16 39.0609 16 38V32C16 30.9391 15.5786 29.9217 14.8284 29.1716C14.0783 28.4214 13.0609 28 12 28H6V38Z" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
            />
            <Text {...propsBlackButtonText}>Play</Text>
          </AutoLayout>
          <AutoLayout
            {...propsBlackButton}
            onClick={() => setShowInfo(!showInfo)}
          >
            <SVG
              src={`<svg width="${iconDimension}" height="${iconDimension}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 32V24M24 16H24.02M44 24C44 35.0457 35.0457 44 24 44C12.9543 44 4 35.0457 4 24C4 12.9543 12.9543 4 24 4C35.0457 4 44 12.9543 44 24Z" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
            />
          </AutoLayout>
        </AutoLayout>
        {infoText("(R)est • Open player • Info")}

        {showInfo && (
          <AutoLayout
            spacing={spacingGap}
            direction="vertical"
            width="fill-parent"
          >
            <AutoLayout
              {...propsBlackButton}
              onClick={() => updateWidgets()}
              width="fill-parent"
            >
              <Text {...propsBlackButtonText}>Update all to v{version}</Text>
            </AutoLayout>
            {infoText(`Symphony v${version}`)}
          </AutoLayout>
        )}
      </AutoLayout>
    );
  } else if (mode === "sound") {
    const svgWidth = NODE_DIAMETER * 1.1;
    const svgHeight = (29 / 249) * svgWidth;
    return (
      <AutoLayout padding={4}>
        <AutoLayout
          verticalAlignItems="center"
          horizontalAlignItems="center"
          direction="vertical"
          cornerRadius={NODE_DIAMETER}
          spacing={NODE_DIAMETER * 0.05}
          stroke={fillFromStepAndOctave(step, octave, "ff")}
          strokeAlign="outside"
          strokeWidth={4}
          fill={fillFromStepAndOctave(step, octave, "ee")}
          height={NODE_DIAMETER - 4}
          width={NODE_DIAMETER - 4}
        >
          <Text
            fontWeight="extra-bold"
            fontSize={NODE_FONT_SIZE}
            fill="#fff"
            horizontalAlignText="center"
            verticalAlignText="center"
            effect={{
              type: "drop-shadow",
              blur: 4,
              color: { r: 0, g: 0, b: 0, a: 0.1 },
              offset: { x: 0, y: 2 },
            }}
          >
            {note}
          </Text>
          <SVG
            src={svgWideFromWave(wave, "#FFF")}
            height={svgHeight}
            width={svgWidth}
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
            horizontalAlignText="center"
            verticalAlignText="center"
            width={NODE_DIAMETER}
            effect={{
              type: "drop-shadow",
              blur: 4,
              color: { r: 0, g: 0, b: 0, a: 0.1 },
              offset: { x: 0, y: 2 },
            }}
          >
            {octave}
          </Text>
        </AutoLayout>
      </AutoLayout>
    );
  } else if (mode === "rest") {
    return (
      <AutoLayout padding={4}>
        <AutoLayout
          verticalAlignItems="center"
          horizontalAlignItems="center"
          direction="vertical"
          cornerRadius={NODE_DIAMETER}
          spacing={NODE_DIAMETER * 0.05}
          stroke={"#000000ff"}
          fill={"#000000ee"}
          strokeAlign="outside"
          strokeWidth={4}
          height={NODE_DIAMETER - 4}
          width={NODE_DIAMETER - 4}
        >
          <Text
            fontWeight="extra-bold"
            fontSize={NODE_FONT_SIZE}
            fill="#fff"
            horizontalAlignText="center"
            verticalAlignText="center"
            effect={{
              type: "drop-shadow",
              blur: 4,
              color: { r: 0, g: 0, b: 0, a: 0.1 },
              offset: { x: 0, y: 2 },
            }}
          >
            REST
          </Text>
        </AutoLayout>
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
  return `<svg viewBox="0 5 30 20" height="36" width="36" stroke="${fill}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">${path}</svg>`;
}

function svgWideFromWave(wave: string, fill: string) {
  let path = {
    sawtooth: `<path d="M48.2886 4.46235C48.2886 3.07604 47.5708 1.78857 46.3915 1.05974C45.2123 0.330916 43.7397 0.26466 42.4997 0.884637L2.49975 20.8846C0.523831 21.8726 -0.277066 24.2753 0.710891 26.2512C1.69885 28.2271 4.10154 29.028 6.07745 28.0401L40.2886 10.9345V24.2743C40.2886 24.3004 40.2888 24.3263 40.2893 24.3522C40.2712 24.9898 40.4057 25.6408 40.7109 26.2512C41.6989 28.2271 44.1016 29.028 46.0775 28.0401L80.2886 10.9345V24.2743C80.2886 24.3003 80.2889 24.3261 80.2893 24.3519C80.2712 24.9896 80.4057 25.6407 80.7109 26.2512C81.6988 28.2271 84.1015 29.028 86.0775 28.0401L120.289 10.9345V24.2743C120.289 24.3003 120.289 24.3262 120.289 24.352C120.271 24.9896 120.406 25.6408 120.711 26.2512C121.699 28.2271 124.102 29.028 126.077 28.0401L160.289 10.9345V24.2743C160.289 24.3004 160.289 24.3264 160.289 24.3524C160.271 24.9899 160.406 25.6409 160.711 26.2512C161.699 28.2271 164.102 29.028 166.077 28.0401L200.289 10.9345V24.2743C200.289 24.3002 200.289 24.326 200.289 24.3518C200.271 24.9895 200.406 25.6407 200.711 26.2512C201.699 28.2271 204.102 29.028 206.077 28.0401L240.289 10.9345V24.2743C240.289 26.4835 242.079 28.2743 244.289 28.2743C246.498 28.2743 248.289 26.4835 248.289 24.2743V4.46235C248.289 3.07604 247.571 1.78857 246.392 1.05974C245.212 0.330916 243.74 0.26466 242.5 0.884637L208.289 17.9902V4.46235C208.289 3.07604 207.571 1.78857 206.392 1.05974C205.212 0.330916 203.74 0.26466 202.5 0.884637L168.289 17.9902V4.46235C168.289 3.07604 167.571 1.78857 166.392 1.05974C165.212 0.330916 163.74 0.26466 162.5 0.884637L128.289 17.9902V4.46235C128.289 3.07604 127.571 1.78857 126.392 1.05974C125.212 0.330916 123.74 0.26466 122.5 0.884637L88.2886 17.9902V4.46235C88.2886 3.07604 87.5708 1.78857 86.3915 1.05974C85.2123 0.330916 83.7397 0.26466 82.4998 0.884637L48.2886 17.9902V4.46235Z" />`,
    sine: `<path fill-rule="evenodd" clip-rule="evenodd" d="M120.617 13.0768C120.566 13.2202 120.522 13.368 120.486 13.5198C119.176 19.1209 116.269 20.396 114.634 20.3648C112.845 20.3308 109.762 18.7386 108.24 13.1665C106.159 5.54719 101.03 0.280951 94.4597 0.366432C88.2222 0.447579 83.1901 5.34528 80.8072 12.4696C80.6267 12.7909 80.4879 13.1428 80.3997 13.5198C79.0892 19.1209 76.1826 20.3959 74.547 20.3648C72.7584 20.3307 69.6749 18.7385 68.1532 13.1665C66.0726 5.54718 60.9437 0.280906 54.373 0.366387C47.9597 0.44982 42.8208 5.62506 40.5254 13.077C40.4741 13.2203 40.4304 13.368 40.3948 13.5198C39.0844 19.1209 36.1777 20.396 34.5421 20.3648C32.7536 20.3308 29.67 18.7386 28.1484 13.1665C26.0677 5.54716 20.9388 0.280955 14.3682 0.366436C7.89564 0.450641 2.72109 5.72121 0.457685 13.2842C-0.175694 15.4006 1.02653 17.6297 3.14292 18.2631C5.25932 18.8965 7.48845 17.6943 8.12183 15.5779C9.8326 9.86144 12.8449 8.38693 14.4722 8.36576C16.0014 8.34587 18.8854 9.61392 20.4309 15.274C22.5357 22.9811 27.874 28.2393 34.3898 28.3634C40.9995 28.4892 46.2451 23.3239 48.1346 15.5512C49.8468 9.85681 52.8523 8.38685 54.4771 8.36571C56.0063 8.34582 58.8902 9.61387 60.4358 15.2739C62.5405 22.981 67.8788 28.2393 74.3947 28.3633C80.8223 28.4857 85.96 23.6043 87.9758 16.1873C88.0699 15.994 88.1497 15.7906 88.2134 15.5779C89.9241 9.86144 92.9364 8.38693 94.5638 8.36575C96.093 8.34586 98.9769 9.61392 100.522 15.274C102.627 22.9811 107.966 28.2393 114.481 28.3634C121.091 28.4892 126.337 23.3238 128.226 15.5511C129.938 9.85678 132.944 8.38684 134.569 8.3657C136.098 8.34581 138.982 9.61387 140.527 15.2739C142.632 22.9811 147.97 28.2393 154.486 28.3633C161.155 28.4903 166.435 23.2311 168.281 15.3423C168.291 15.2974 168.301 15.2526 168.31 15.2078C170.038 9.79745 172.954 8.38646 174.546 8.36575C176.075 8.34586 178.959 9.61392 180.505 15.274C182.609 22.9811 187.948 28.2393 194.464 28.3634C201.073 28.4892 206.319 23.3239 208.208 15.5512C209.92 9.85681 212.926 8.38684 214.551 8.3657C216.08 8.34581 218.964 9.61387 220.509 15.2739C222.614 22.9811 227.952 28.2393 234.468 28.3633C241.137 28.4903 246.417 23.2311 248.263 15.3423C248.766 13.1912 247.43 11.0395 245.279 10.5362C243.128 10.0329 240.977 11.3687 240.473 13.5197C239.163 19.1209 236.256 20.3959 234.621 20.3648C232.832 20.3307 229.749 18.7385 228.227 13.1665C226.146 5.54718 221.017 0.280901 214.447 0.366382C208.033 0.449816 202.894 5.62509 200.599 13.077C200.548 13.2204 200.504 13.368 200.468 13.5198C199.158 19.1209 196.251 20.396 194.616 20.3648C192.827 20.3308 189.744 18.7386 188.222 13.1665C186.141 5.54722 181.012 0.280951 174.442 0.366432C167.969 0.450636 162.795 5.7212 160.531 13.2842C160.47 13.4887 160.426 13.6941 160.398 13.8992C159.048 19.1788 156.237 20.3952 154.638 20.3648C152.85 20.3307 149.766 18.7385 148.245 13.1665C146.164 5.54717 141.035 0.280901 134.465 0.366382C128.051 0.449815 122.912 5.62499 120.617 13.0768Z" />`,
    square: `<path d="M4.2887 0.510315C2.07956 0.510315 0.288704 2.30118 0.288704 4.51031V24.3837C0.288704 26.5929 2.07956 28.3837 4.2887 28.3837C6.49784 28.3837 8.2887 26.5929 8.2887 24.3837V8.51031H20.2887V24.3837C20.2887 26.5929 22.0796 28.3837 24.2887 28.3837H44.2887C46.4978 28.3837 48.2887 26.5929 48.2887 24.3837V8.51031H60.2887V24.3837C60.2887 26.5929 62.0796 28.3837 64.2887 28.3837H84.2883C84.3054 28.3837 84.3229 28.3836 84.34 28.3834C84.5204 28.3811 84.6979 28.3669 84.8717 28.3415C86.8045 28.0592 88.2887 26.3948 88.2887 24.3837C88.2887 24.3649 88.2886 24.3461 88.2883 24.3273V8.51031H100.288V24.3837C100.288 26.5929 102.079 28.3837 104.288 28.3837H124.288C126.497 28.3837 128.288 26.5929 128.288 24.3837V8.51031H140.288V24.3837C140.288 26.5929 142.079 28.3837 144.288 28.3837H164.288C164.564 28.3837 164.834 28.3557 165.094 28.3024C165.664 28.186 166.189 27.9485 166.642 27.6182C167.64 26.8908 168.288 25.713 168.288 24.3837L168.288 24.345V8.51031H180.288V24.3837C180.288 26.5929 182.079 28.3837 184.288 28.3837H204.288C206.497 28.3837 208.288 26.5929 208.288 24.3837V8.51031H220.288V24.3837C220.288 26.5929 222.079 28.3837 224.288 28.3837H244.288C246.497 28.3837 248.288 26.5929 248.288 24.3837C248.288 22.1746 246.497 20.3837 244.288 20.3837H228.288V4.51031C228.288 2.30118 226.497 0.510315 224.288 0.510315H204.288C202.079 0.510315 200.288 2.30118 200.288 4.51031V20.3837H188.288V4.51031C188.288 2.30118 186.497 0.510315 184.288 0.510315H164.288C162.079 0.510315 160.288 2.30118 160.288 4.51031V20.3837H148.288V4.51031C148.288 2.30118 146.497 0.510315 144.288 0.510315H124.288C122.079 0.510315 120.288 2.30118 120.288 4.51031V20.3837H108.288V4.51031C108.288 2.30118 106.497 0.510315 104.288 0.510315H84.2883C82.0792 0.510315 80.2883 2.30118 80.2883 4.51031V20.3837H68.2887V4.51031C68.2887 2.30118 66.4978 0.510315 64.2887 0.510315H44.2887C42.0796 0.510315 40.2887 2.30118 40.2887 4.51031V20.3837H28.2887V4.51031C28.2887 2.30118 26.4978 0.510315 24.2887 0.510315H4.2887Z" />`,
    triangle: `<path d="M27.205 1.5793C25.6444 0.0260638 23.122 0.0260571 21.5615 1.57928L1.46695 21.5793C-0.0988233 23.1377 -0.104793 25.6703 1.45362 27.2361C3.01203 28.8019 5.54468 28.8079 7.11046 27.2495L24.3832 10.058L40.8325 26.4301C41.0005 26.7178 41.2076 26.989 41.4535 27.2361C43.0119 28.8019 45.5446 28.8079 47.1104 27.2495L64.3831 10.058L80.8324 26.4301C81.0005 26.7178 81.2075 26.989 81.4534 27.2361C83.0118 28.8019 85.5445 28.8079 87.1103 27.2495L104.383 10.058L120.832 26.4301C121 26.7178 121.207 26.989 121.453 27.2361C123.012 28.8019 125.544 28.8079 127.11 27.2495L144.383 10.058L160.832 26.4301C161 26.7177 161.207 26.989 161.453 27.2361C163.012 28.8019 165.544 28.8079 167.11 27.2495L184.383 10.058L200.832 26.4301C201 26.7177 201.207 26.989 201.453 27.2361C203.012 28.8019 205.544 28.8079 207.11 27.2495L224.383 10.058L241.466 27.0614C243.032 28.6199 245.565 28.6139 247.123 27.0481C248.682 25.4824 248.676 22.9497 247.11 21.3913L227.204 1.5793C225.644 0.0260638 223.122 0.0260571 221.561 1.57928L204.383 18.6768L187.205 1.5793C185.644 0.0260638 183.122 0.0260571 181.561 1.57928L164.383 18.6768L147.205 1.5793C145.644 0.0260638 143.122 0.0260571 141.561 1.57928L124.383 18.6768L107.205 1.5793C105.644 0.0260638 103.122 0.0260571 101.561 1.57928L84.383 18.6768L67.2049 1.5793C65.6443 0.0260638 63.1219 0.0260571 61.5614 1.57928L44.3831 18.6768L27.205 1.5793Z" />`,
  }[wave];
  return `<svg width="249" height="29" viewBox="0 0 249 29" fill="${fill}" xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
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
