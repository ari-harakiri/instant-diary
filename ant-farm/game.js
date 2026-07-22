(() => {
  "use strict";

  const SAVE_KEY = "little-colony-save-v1";
  const canvas = document.getElementById("habitat");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const ui = {
    meters: document.getElementById("meters"),
    day: document.getElementById("day-label"),
    stage: document.getElementById("stage-label"),
    population: document.getElementById("population-label"),
    face: document.getElementById("lcd-face"),
    lcdMessage: document.getElementById("lcd-message"),
    journal: document.getElementById("journal-message"),
    saveNote: document.getElementById("save-note"),
    lightNote: document.getElementById("light-note"),
    help: document.getElementById("help-dialog")
  };

  const meterDefinitions = [
    ["food", "Food"],
    ["water", "Water"],
    ["happiness", "Happy"],
    ["cleanliness", "Clean"],
    ["health", "Health"]
  ];

  const stages = [
    { name: "Starter burrow", min: 0, workers: 3, eggs: 2, larvae: 0 },
    { name: "Nursery tunnels", min: 70, workers: 5, eggs: 3, larvae: 2 },
    { name: "Growing nest", min: 190, workers: 8, eggs: 4, larvae: 3 },
    { name: "Busy colony", min: 380, workers: 12, eggs: 5, larvae: 4 },
    { name: "Thriving kingdom", min: 660, workers: 17, eggs: 6, larvae: 5, winged: 2 }
  ];

  const defaultState = () => ({
    version: 1,
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    lastSave: Date.now(),
    gameMinutes: 8 * 60,
    food: 78,
    water: 80,
    happiness: 76,
    cleanliness: 84,
    health: 82,
    energy: 82,
    growth: 0,
    stage: 0,
    lampOn: false,
    day: 1,
    actionMessage: "Your tiny colony has arrived. Keep their needs balanced and they will build.",
    actionUntil: 0
  });

  let state = loadState();
  let ants = [];
  let particles = [];
  let lastFrame = performance.now();
  let lastUi = 0;
  let lastAutoSave = Date.now();

  buildMeters();
  applyOfflineProgress();
  syncStage(true);
  rebuildAnts();
  updateUI(true);
  wireControls();
  requestAnimationFrame(frame);

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved || saved.version !== 1) return defaultState();
      return { ...defaultState(), ...saved, lastUpdate: Number(saved.lastUpdate) || Date.now() };
    } catch (_error) {
      return defaultState();
    }
  }

  function saveState(showNotice = false) {
    state.lastUpdate = Date.now();
    state.lastSave = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      if (showNotice) {
        ui.saveNote.textContent = "Saved just now";
        setTimeout(() => { ui.saveNote.textContent = "Saved locally"; }, 1500);
      }
    } catch (_error) {
      ui.saveNote.textContent = "Saving unavailable";
    }
  }

  function applyOfflineProgress() {
    const awaySeconds = Math.min(8 * 60 * 60, Math.max(0, (Date.now() - state.lastUpdate) / 1000));
    if (awaySeconds < 15) return;
    const awayMinutes = awaySeconds / 60;
    state.food = clamp(state.food - awayMinutes * .18);
    state.water = clamp(state.water - awayMinutes * .22);
    state.cleanliness = clamp(state.cleanliness - awayMinutes * .11);
    state.happiness = clamp(state.happiness - awayMinutes * .08);
    const wellbeing = average(state.food, state.water, state.cleanliness, state.happiness);
    state.health = clamp(state.health + (wellbeing > 55 ? awayMinutes * .035 : -awayMinutes * .12));
    state.growth += Math.min(120, awaySeconds * (wellbeing / 100) * .05);
    state.gameMinutes += awaySeconds * 2;
    state.day = Math.floor(state.gameMinutes / 1440) + 1;
    state.actionMessage = awaySeconds > 300
      ? `While you were away, the colony kept ${wellbeing > 55 ? "digging gently" : "waiting for care"}.`
      : state.actionMessage;
  }

  function buildMeters() {
    ui.meters.innerHTML = "";
    meterDefinitions.forEach(([key, label]) => {
      const meter = document.createElement("div");
      meter.className = "meter";
      meter.innerHTML = `<div class="meter-label"><span>${label}</span><span data-meter-value="${key}">0</span></div><div class="meter-track"><span class="meter-fill" data-meter="${key}"></span></div>`;
      ui.meters.appendChild(meter);
    });
  }

  function wireControls() {
    document.querySelectorAll("[data-action]").forEach(button => {
      button.addEventListener("click", () => performAction(button.dataset.action));
    });

    document.getElementById("help-button").addEventListener("click", () => ui.help.showModal());
    document.getElementById("reset-button").addEventListener("click", () => {
      if (!window.confirm("Start a completely new colony? This removes the current ant-farm save.")) return;
      state = defaultState();
      localStorage.removeItem(SAVE_KEY);
      syncStage(true);
      rebuildAnts();
      particles = [];
      announce("A new colony is settling into its starter burrow.");
      saveState(true);
      updateUI(true);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) saveState();
      else {
        applyOfflineProgress();
        syncStage();
        updateUI(true);
      }
    });
    window.addEventListener("pagehide", () => saveState());
  }

  function performAction(action) {
    const messages = {
      feed: "The workers carry fresh seeds down to the pantry.",
      water: "Cool droplets collect near the nursery.",
      love: "Your visit puts a spring in every tiny step.",
      clean: "The glass sparkles and the waste corner is tidy again."
    };

    if (action === "light") {
      state.lampOn = !state.lampOn;
      announce(state.lampOn ? "The gentle habitat lamp clicks on." : "The lamp clicks off so the colony can rest naturally.");
      burst("light", 22);
    } else {
      if (action === "feed") state.food = clamp(state.food + 24);
      if (action === "water") state.water = clamp(state.water + 25);
      if (action === "love") state.happiness = clamp(state.happiness + 22);
      if (action === "clean") state.cleanliness = clamp(state.cleanliness + 30);
      state.growth += 7;
      state.health = clamp(state.health + 2);
      announce(messages[action]);
      burst(action, action === "clean" ? 25 : 16);
    }

    syncStage();
    updateUI(true);
    saveState(true);
  }

  function announce(message) {
    state.actionMessage = message;
    state.actionUntil = Date.now() + 8500;
    ui.journal.textContent = message;
  }

  function updateSimulation(dt) {
    const realSeconds = dt / 1000;
    state.gameMinutes += realSeconds * 2;
    state.day = Math.floor(state.gameMinutes / 1440) + 1;
    const night = isNight();

    state.food = clamp(state.food - realSeconds * .018);
    state.water = clamp(state.water - realSeconds * (.021 + (state.lampOn ? .008 : 0)));
    state.cleanliness = clamp(state.cleanliness - realSeconds * .011);
    state.happiness = clamp(state.happiness - realSeconds * .008);
    state.energy = clamp(state.energy + realSeconds * (night ? .065 : -.024));

    const wellbeing = average(state.food, state.water, state.happiness, state.cleanliness, state.energy);
    const healthTarget = wellbeing + (state.lampOn && night ? 3 : 0);
    state.health = clamp(state.health + (healthTarget - state.health) * realSeconds * .006);

    if (state.health > 35 && state.food > 25 && state.water > 25) {
      const workRate = night ? .14 : .34;
      state.growth += realSeconds * workRate * (state.health / 100);
    }

    syncStage();
    updateAnts(realSeconds, night);
    updateParticles(realSeconds);
  }

  function syncStage(force = false) {
    let next = 0;
    stages.forEach((stage, index) => { if (state.growth >= stage.min) next = index; });
    if (!force && next > state.stage) {
      state.stage = next;
      rebuildAnts();
      announce(`${stages[next].name} unlocked! The workers opened a new chamber.`);
      burst("growth", 35);
      saveState(true);
    } else {
      state.stage = next;
      if (force || ants.length !== stages[next].workers) rebuildAnts();
    }
  }

  function rebuildAnts() {
    const count = stages[state.stage].workers;
    ants = Array.from({ length: count }, (_, index) => makeAnt(index));
  }

  function makeAnt(index) {
    const areas = tunnelAreas(state.stage);
    const areaIndex = index % areas.length;
    const point = randomPointInArea(areaIndex);
    return {
      x: point.x,
      y: point.y,
      tx: point.x,
      ty: point.y,
      areaIndex,
      pendingAreaIndex: null,
      route: [],
      speed: 14 + Math.random() * 13,
      pause: Math.random() * 2,
      carrying: index % 5 === 0,
      winged: false,
      direction: 1,
      bob: Math.random() * Math.PI * 2
    };
  }

  function randomPointInArea(areaIndex = 0) {
    const areas = tunnelAreas(state.stage);
    const safeIndex = Math.max(0, Math.min(areas.length - 1, areaIndex));
    const area = areas[safeIndex] || areas[0];
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * .68;
    return {
      x: area.x + Math.cos(angle) * area.rx * radius,
      y: area.y + Math.sin(angle) * area.ry * radius
    };
  }

  function neighboringAreas(areaIndex) {
    const neighbors = [];
    tunnelConnections(state.stage).forEach(([a, b]) => {
      if (a === areaIndex) neighbors.push(b);
      if (b === areaIndex) neighbors.push(a);
    });
    return [...new Set(neighbors)];
  }

  function buildTunnelRoute(fromIndex, toIndex) {
    const areas = tunnelAreas(state.stage);
    const from = areas[fromIndex];
    const to = areas[toIndex];
    if (!from || !to) return [];
    const controlX = (from.x + to.x) / 2;
    const controlY = Math.min(from.y, to.y) - 10;
    const points = [];
    const steps = 12;
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const inverse = 1 - t;
      points.push({
        x: inverse * inverse * from.x + 2 * inverse * t * controlX + t * t * to.x,
        y: inverse * inverse * from.y + 2 * inverse * t * controlY + t * t * to.y
      });
    }
    return points;
  }

  function chooseAntMove(ant, night) {
    if (Number.isInteger(ant.pendingAreaIndex)) {
      ant.areaIndex = ant.pendingAreaIndex;
      ant.pendingAreaIndex = null;
    }

    const neighbors = neighboringAreas(ant.areaIndex);
    const shouldTravel = neighbors.length > 0 && Math.random() < .34;
    if (shouldTravel) {
      const destination = neighbors[Math.floor(Math.random() * neighbors.length)];
      ant.route = buildTunnelRoute(ant.areaIndex, destination);
      ant.pendingAreaIndex = destination;
      const next = ant.route.shift();
      if (next) {
        ant.tx = next.x;
        ant.ty = next.y;
        ant.pause = 0;
        ant.carrying = Math.random() < .32;
        return;
      }
    }

    const next = randomPointInArea(ant.areaIndex);
    ant.tx = next.x;
    ant.ty = next.y;
    ant.pause = night && !state.lampOn ? 2.5 + Math.random() * 5 : Math.random() * 1.2;
    ant.carrying = Math.random() < .24;
  }

  function updateAnts(dt, night) {
    ants.forEach((ant, index) => {
      ant.winged = Boolean(stages[state.stage].winged && index >= ants.length - stages[state.stage].winged);
      ant.bob += dt * 6;
      if (ant.pause > 0) {
        ant.pause -= dt;
        return;
      }
      const dx = ant.tx - ant.x;
      const dy = ant.ty - ant.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 4) {
        if (ant.route.length) {
          const next = ant.route.shift();
          ant.tx = next.x;
          ant.ty = next.y;
          ant.pause = 0;
        } else {
          chooseAntMove(ant, night);
        }
        return;
      }
      const pace = ant.speed * (night && !state.lampOn ? .34 : 1) * dt;
      ant.direction = dx < 0 ? -1 : 1;
      ant.x += dx / distance * Math.min(distance, pace);
      ant.y += dy / distance * Math.min(distance, pace);
    });
  }

  function burst(kind, count) {
    const colors = {
      feed: ["#f0c45b", "#d99031", "#fff0b2"],
      water: ["#8dd6ef", "#3e94c4", "#d5f4ff"],
      love: ["#ef7c87", "#ffb0a9", "#fff0d4"],
      clean: ["#d9f1a4", "#fffbd3", "#98b85b"],
      light: ["#ffe277", "#f6ac42", "#fff3b3"],
      growth: ["#e8c068", "#b6cf6b", "#fff2b1"]
    };
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x: 480 + (Math.random() - .5) * 280,
        y: kind === "growth" ? 370 : 110 + Math.random() * 130,
        vx: (Math.random() - .5) * 75,
        vy: -20 - Math.random() * 65,
        life: .7 + Math.random() * 1.2,
        size: 3 + Math.random() * 6,
        color: colors[kind][Math.floor(Math.random() * colors[kind].length)],
        kind
      });
    }
  }

  function updateParticles(dt) {
    particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 30 * dt;
      p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);
  }

  function frame(now) {
    const dt = Math.min(1000, now - lastFrame);
    lastFrame = now;
    updateSimulation(dt);
    drawHabitat(now / 1000);

    if (now - lastUi > 500) {
      updateUI();
      lastUi = now;
    }
    if (Date.now() - lastAutoSave > 10000) {
      saveState();
      lastAutoSave = Date.now();
    }
    requestAnimationFrame(frame);
  }

  function drawHabitat(time) {
    const W = canvas.width;
    const H = canvas.height;
    const night = isNight();
    const hour = (state.gameMinutes / 60) % 24;

    drawSky(W, H, night, hour, time);
    drawGround(W, H);
    drawTunnels();
    drawNestContents(time, night);
    drawPlants(time);
    drawParticles();

    if (state.lampOn) {
      const glow = ctx.createRadialGradient(W / 2, 40, 30, W / 2, 120, 520);
      glow.addColorStop(0, "rgba(255,225,126,.18)");
      glow.addColorStop(1, "rgba(255,190,78,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    drawGlassDetails(time, night);
    ctx.fillStyle = "rgba(255,255,255,.42)";
    ctx.fillRect(12, 12, 5, 130);
    ctx.fillRect(W - 17, 12, 4, 100);
  }

  function drawSky(W, _H, night, hour, time) {
    const sky = ctx.createLinearGradient(0, 0, 0, 225);
    if (night) {
      sky.addColorStop(0, "#132342");
      sky.addColorStop(1, "#345474");
    } else {
      const dusk = hour < 7 || hour > 18;
      sky.addColorStop(0, dusk ? "#d17f63" : "#62abe0");
      sky.addColorStop(1, dusk ? "#edb278" : "#acd5ec");
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 230);

    const cloudDrift = (time * 2.5) % 1100;
    if (night) {
      drawPixelCloud((125 + cloudDrift * .18) % 1050 - 40, 112, .7, "rgba(21,39,68,.58)");
      drawPixelCloud((570 + cloudDrift * .1) % 1080 - 30, 154, .55, "rgba(42,65,91,.48)");
    } else {
      drawPixelCloud((115 + cloudDrift) % 1120 - 80, 66, .86, "rgba(238,248,244,.73)");
      drawPixelCloud((530 + cloudDrift * .55) % 1100 - 70, 136, .62, "rgba(231,245,239,.56)");
    }

    if (night) {
      ctx.fillStyle = "#e8dfb0";
      for (let i = 0; i < 20; i += 1) {
        const x = (i * 83 + 37) % W;
        const y = 20 + (i * 47) % 130;
        const s = (Math.sin(time * 2 + i) + 1) > 1.1 ? 3 : 2;
        ctx.fillRect(x, y, s, s);
      }
      ctx.fillStyle = "#efe7bd";
      ctx.beginPath(); ctx.arc(780, 72, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a2e50";
      ctx.beginPath(); ctx.arc(793, 62, 27, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "#f6d672";
      ctx.beginPath(); ctx.arc(780, 72, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,230,130,.7)";
      ctx.lineWidth = 4;
      for (let a = 0; a < 8; a += 1) {
        const angle = a * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(780 + Math.cos(angle) * 40, 72 + Math.sin(angle) * 40);
        ctx.lineTo(780 + Math.cos(angle) * 51, 72 + Math.sin(angle) * 51);
        ctx.stroke();
      }
    }

    ctx.fillStyle = night ? "rgba(24,53,56,.48)" : "rgba(82,124,76,.38)";
    for (let x = 0; x < W; x += 26) {
      const height = 7 + ((x * 13) % 17);
      ctx.fillRect(x, 214 - height, 4, height);
      ctx.fillRect(x + 5, 214 - Math.max(4, height - 5), 3, Math.max(4, height - 5));
    }
  }

  function drawPixelCloud(x, y, scale, color) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.fillRect(0, 12, 98, 18);
    ctx.fillRect(15, 3, 32, 27);
    ctx.fillRect(42, 0, 38, 30);
    ctx.fillRect(76, 10, 38, 20);
    ctx.restore();
  }

  function drawGround(W, H) {
    ctx.fillStyle = "#3e2113";
    ctx.fillRect(0, 214, W, H - 214);
    ctx.fillStyle = "#6d391d";
    ctx.fillRect(0, 218, W, 12);
    ctx.fillStyle = "#4c2917";
    for (let y = 235; y < H; y += 20) {
      for (let x = (y % 40); x < W; x += 38) {
        const n = ((x * 7 + y * 13) % 17);
        ctx.fillStyle = n < 7 ? "#5b301a" : n < 12 ? "#392014" : "#7b4422";
        ctx.fillRect(x, y, 4 + n % 5, 3 + n % 3);
      }
    }

    ctx.globalAlpha = .24;
    ctx.strokeStyle = "#a55d2f";
    ctx.lineWidth = 3;
    [286, 408, 515].forEach((y, row) => {
      for (let x = 18 + row * 23; x < W - 24; x += 92) {
        ctx.beginPath();
        ctx.moveTo(x, y + ((x / 9) % 5));
        ctx.lineTo(x + 47, y - 2 + ((x / 13) % 6));
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;

    drawSoilRoot(105, 224, 96, 1);
    drawSoilRoot(872, 224, 88, -1);

    const stones = [
      [48, 286, 8, "#927154"], [895, 286, 11, "#78604c"],
      [74, 392, 6, "#b07b4d"], [905, 376, 7, "#9a7658"],
      [285, 514, 7, "#72523d"], [704, 515, 9, "#936b4d"],
      [462, 255, 5, "#c08a54"]
    ];
    stones.forEach(([x, y, radius, color]) => {
      ctx.fillStyle = "rgba(27,15,10,.42)";
      ctx.beginPath(); ctx.ellipse(x + 2, y + 3, radius, radius * .65, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .65, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,224,171,.25)";
      ctx.fillRect(x - radius * .45, y - radius * .3, Math.max(2, radius * .5), 2);
    });

    ctx.strokeStyle = "#8c542c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(38, 498); ctx.lineTo(71, 485); ctx.lineTo(88, 494); ctx.stroke();
    ctx.fillStyle = "#d29c48";
    ctx.fillRect(847, 305, 9, 5);
    ctx.fillStyle = "#f0cf78";
    ctx.fillRect(849, 304, 4, 2);

    if (state.cleanliness < 55) {
      const count = Math.ceil((55 - state.cleanliness) / 8);
      ctx.fillStyle = "#21140d";
      for (let i = 0; i < count; i += 1) {
        ctx.fillRect(850 + (i * 19) % 76, 485 - (i % 3) * 8, 7, 4);
      }
    }
  }

  function drawSoilRoot(x, y, length, direction) {
    ctx.strokeStyle = "rgba(150,91,45,.72)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 8 * direction, y + 23, x - 10 * direction, y + 48, x + 13 * direction, y + length);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 2 * direction, y + 36);
    ctx.lineTo(x + 22 * direction, y + 53);
    ctx.moveTo(x + 3 * direction, y + 65);
    ctx.lineTo(x - 16 * direction, y + 82);
    ctx.stroke();
  }

  function tunnelAreas(stage) {
    const layouts = [
      [
        { x: 300, y: 330, rx: 136, ry: 51, seed: 1 },
        { x: 660, y: 348, rx: 134, ry: 52, seed: 2 }
      ],
      [
        { x: 294, y: 324, rx: 143, ry: 53, seed: 1 },
        { x: 668, y: 341, rx: 142, ry: 54, seed: 2 },
        { x: 480, y: 462, rx: 148, ry: 47, seed: 3 }
      ],
      [
        { x: 286, y: 317, rx: 151, ry: 56, seed: 1 },
        { x: 678, y: 334, rx: 149, ry: 57, seed: 2 },
        { x: 492, y: 463, rx: 158, ry: 49, seed: 3 },
        { x: 126, y: 454, rx: 76, ry: 38, seed: 4 },
        { x: 852, y: 454, rx: 76, ry: 38, seed: 5 }
      ],
      [
        { x: 280, y: 311, rx: 161, ry: 59, seed: 1 },
        { x: 686, y: 328, rx: 159, ry: 60, seed: 2 },
        { x: 488, y: 466, rx: 171, ry: 52, seed: 3 },
        { x: 118, y: 454, rx: 82, ry: 40, seed: 4 },
        { x: 860, y: 454, rx: 82, ry: 40, seed: 5 }
      ],
      [
        { x: 280, y: 311, rx: 161, ry: 59, seed: 1 },
        { x: 686, y: 328, rx: 159, ry: 60, seed: 2 },
        { x: 488, y: 466, rx: 171, ry: 52, seed: 3 },
        { x: 118, y: 454, rx: 82, ry: 40, seed: 4 },
        { x: 860, y: 454, rx: 82, ry: 40, seed: 5 }
      ]
    ];
    return layouts[Math.min(layouts.length - 1, Math.max(0, stage))];
  }

  function tunnelConnections(stage) {
    const layouts = [
      [[0, 1]],
      [[0, 1], [0, 2], [1, 2]],
      [[0, 1], [0, 2], [1, 2], [0, 3], [3, 2], [1, 4], [4, 2]],
      [[0, 1], [0, 2], [1, 2], [0, 3], [3, 2], [1, 4], [4, 2], [3, 4]],
      [[0, 1], [0, 2], [1, 2], [0, 3], [3, 2], [1, 4], [4, 2], [3, 4]]
    ];
    return layouts[Math.min(layouts.length - 1, Math.max(0, stage))];
  }

  function tunnelExpansionRoutes(stage, areas) {
    if (stage < 4 || areas.length < 5) return [];
    return [
      {
        startX: areas[0].x - areas[0].rx * .58,
        startY: areas[0].y + areas[0].ry * .18,
        controlX: 64,
        controlY: 350,
        endX: areas[3].x - areas[3].rx * .34,
        endY: areas[3].y - areas[3].ry * .28
      },
      {
        startX: areas[1].x + areas[1].rx * .56,
        startY: areas[1].y + areas[1].ry * .22,
        controlX: 914,
        controlY: 350,
        endX: areas[4].x + areas[4].rx * .34,
        endY: areas[4].y - areas[4].ry * .28
      }
    ];
  }

  function drawTunnels() {
    const areas = tunnelAreas(state.stage);
    const connections = tunnelConnections(state.stage);
    const expansionRoutes = tunnelExpansionRoutes(state.stage, areas);
    const floor = ctx.createLinearGradient(0, 248, 0, 525);
    floor.addColorStop(0, "#d59a5b");
    floor.addColorStop(.5, "#c9874b");
    floor.addColorStop(1, "#b56f3d");

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawExcavationLayer(areas, connections, expansionRoutes, 43, 10, 8, "rgba(24,12,8,.45)");
    drawExcavationLayer(areas, connections, expansionRoutes, 36, 6, 3, "#75401f");
    drawExcavationLayer(areas, connections, expansionRoutes, 27, 0, 0, floor);

    ctx.fillStyle = "rgba(93,48,25,.28)";
    areas.forEach((area, index) => {
      for (let speck = 0; speck < 4; speck += 1) {
        const sx = area.x - area.rx * .48 + ((speck * 43 + index * 29) % Math.max(26, area.rx * .95));
        const sy = area.y - area.ry * .16 + ((speck * 13 + index * 7) % Math.max(12, area.ry * .38));
        ctx.fillRect(Math.round(sx), Math.round(sy), 3 + speck % 2, 2);
      }
    });

    ctx.restore();
  }

  function drawExcavationLayer(areas, connections, expansionRoutes, pathWidth, chamberExpansion, yOffset, style) {
    ctx.strokeStyle = style;
    ctx.lineWidth = pathWidth;

    connections.forEach(([a, b]) => {
      if (!areas[a] || !areas[b]) return;
      const controlX = (areas[a].x + areas[b].x) / 2;
      const controlY = Math.min(areas[a].y, areas[b].y) - 10;
      traceTunnelPath(
        areas[a].x,
        areas[a].y + yOffset,
        controlX,
        controlY + yOffset,
        areas[b].x,
        areas[b].y + yOffset
      );
      ctx.stroke();
    });

    expansionRoutes.forEach(route => {
      traceTunnelPath(
        route.startX,
        route.startY + yOffset,
        route.controlX,
        route.controlY + yOffset,
        route.endX,
        route.endY + yOffset
      );
      ctx.stroke();
    });

    traceTunnelPath(478, 230 + yOffset, 470, 260 + yOffset, areas[0].x, areas[0].y - 18 + yOffset);
    ctx.stroke();

    ctx.fillStyle = style;
    areas.forEach(area => {
      traceOrganicChamber(area, chamberExpansion, yOffset);
      ctx.fill();
    });
  }

  function traceTunnelPath(startX, startY, controlX, controlY, endX, endY) {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
  }

  function traceOrganicChamber(area, expansion = 0, yOffset = 0) {
    const points = [];
    const pointCount = 12;
    for (let point = 0; point < pointCount; point += 1) {
      const angle = point / pointCount * Math.PI * 2;
      const wobble = 1 + Math.sin((point + 1) * (area.seed + 2) * 1.37) * .018;
      points.push({
        x: area.x + Math.cos(angle) * (area.rx + expansion) * wobble,
        y: area.y + yOffset + Math.sin(angle) * (area.ry + expansion * .62) * wobble
      });
    }

    const firstMid = {
      x: (points[0].x + points[pointCount - 1].x) / 2,
      y: (points[0].y + points[pointCount - 1].y) / 2
    };
    ctx.beginPath();
    ctx.moveTo(firstMid.x, firstMid.y);
    points.forEach((point, index) => {
      const next = points[(index + 1) % pointCount];
      ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    });
    ctx.closePath();
  }

  function drawNestContents(time, night) {
    const stage = stages[state.stage];
    const areas = tunnelAreas(state.stage);
    const nursery = areas[Math.min(areas.length - 1, 2)];

    for (let i = 0; i < stage.eggs; i += 1) {
      drawEgg(nursery.x - 45 + i * 18, nursery.y + 13 + (i % 2) * 9, 7, "#f2ddb0");
    }
    for (let i = 0; i < stage.larvae; i += 1) {
      drawLarva(nursery.x + 35 + i * 18, nursery.y + 17 + (i % 2) * 8);
    }

    ants.forEach((ant, index) => drawAnt(ant, time, night, index));
  }

  function drawEgg(x, y, r, color) {
    ctx.fillStyle = "#6a4026";
    ctx.beginPath(); ctx.ellipse(x + 1, y + 2, r, r * .72, -.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * .72, -.2, 0, Math.PI * 2); ctx.fill();
  }

  function drawLarva(x, y) {
    ctx.strokeStyle = "#6a4026";
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.quadraticCurveTo(x, y - 8, x + 9, y); ctx.stroke();
    ctx.strokeStyle = "#f1d7a3";
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x - 8, y - 1); ctx.quadraticCurveTo(x, y - 8, x + 9, y - 1); ctx.stroke();
  }

  function drawAnt(ant, time, night, index) {
    ctx.save();
    ctx.translate(Math.round(ant.x), Math.round(ant.y + Math.sin(ant.bob) * 1.5));
    ctx.scale(ant.direction, 1);
    const scale = ant.winged ? 1.23 : 1;
    ctx.scale(scale, scale);

    const sleeping = night && !state.lampOn && ant.pause > 1.5;
    const body = index === 0 ? "#2a1710" : "#321a11";
    ctx.strokeStyle = "#1b100b";
    ctx.lineWidth = 2;

    if (ant.winged) {
      ctx.fillStyle = "rgba(210,232,226,.76)";
      ctx.beginPath(); ctx.ellipse(-2, -7, 9, 4, -.45, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, -7, 9, 4, .45, 0, Math.PI * 2); ctx.fill();
    }

    for (let leg = -1; leg <= 1; leg += 1) {
      ctx.beginPath();
      ctx.moveTo(leg * 6, 2);
      ctx.lineTo(leg * 8 - 5, 8 + Math.abs(leg) * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(leg * 6, 1);
      ctx.lineTo(leg * 8 + 6, -7);
      ctx.stroke();
    }

    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-9, 0, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1, 0, 6, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(11, -1, 7, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8e5130";
    ctx.fillRect(-12, -3, 4, 3);
    ctx.fillStyle = "#f7d79b";
    ctx.fillRect(13, -3, 2, 2);

    ctx.beginPath(); ctx.moveTo(14, -6); ctx.quadraticCurveTo(20, -14, 22, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -7); ctx.quadraticCurveTo(13, -15, 16, -12); ctx.stroke();

    if (ant.carrying && !sleeping) {
      ctx.fillStyle = "#e2b749";
      ctx.beginPath(); ctx.arc(22, -1, 4, 0, Math.PI * 2); ctx.fill();
    }

    if (sleeping) {
      ctx.fillStyle = "#e8dcae";
      ctx.font = "bold 12px monospace";
      ctx.fillText("z", 18, -15 - (index % 3) * 4);
    }
    ctx.restore();
  }

  function drawPlants(time) {
    drawPlant(70, 230, 1.05, time);
    drawPlant(860, 230, .95, time + 2);
    ctx.fillStyle = "#6a6b5a";
    ctx.beginPath(); ctx.ellipse(810, 205, 31, 20, -.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#85877b";
    ctx.beginPath(); ctx.ellipse(804, 199, 22, 13, -.15, Math.PI, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = "#345826";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(410, 216); ctx.lineTo(410, 188); ctx.stroke();
    ctx.fillStyle = "#e78491";
    [[404,187],[416,187],[410,181],[410,193]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = "#f2c85d";
    ctx.fillRect(407, 184, 7, 7);

    ctx.fillStyle = "#517735";
    [[515,211],[526,209],[521,200],[532,200]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.ellipse(x, y, 8, 5, -.2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = "#84613e";
    ctx.fillRect(612, 207, 56, 8);
    ctx.fillStyle = "#aa7946";
    ctx.fillRect(618, 202, 45, 6);
    ctx.fillStyle = "#5d7f36";
    ctx.fillRect(622, 198, 10, 4);
    ctx.fillRect(646, 199, 13, 3);

    ctx.fillStyle = "#b64f3c";
    ctx.fillRect(706, 197, 20, 10);
    ctx.fillRect(711, 191, 10, 8);
    ctx.fillStyle = "#eee0b2";
    ctx.fillRect(714, 207, 5, 12);
  }

  function drawPlant(x, y, scale, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#274b1e";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    for (let i = -3; i <= 3; i += 1) {
      const sway = Math.sin(time * .7 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(i * 6, 0);
      ctx.quadraticCurveTo(i * 11 + sway, -38 - Math.abs(i) * 3, i * 17 + sway, -67 + Math.abs(i) * 6);
      ctx.stroke();
      ctx.strokeStyle = i % 2 ? "#46742c" : "#5e8732";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = "#274b1e";
      ctx.lineWidth = 10;
    }
    ctx.restore();
  }

  function drawGlassDetails(time, night) {
    ctx.fillStyle = night ? "rgba(171,211,221,.28)" : "rgba(236,251,255,.34)";
    const specks = [[36,55,3],[48,161,2],[915,96,3],[902,181,2],[278,42,2],[684,116,2]];
    specks.forEach(([x,y,size], index) => {
      const shimmer = (Math.sin(time * .65 + index) + 1) * .18 + .35;
      ctx.globalAlpha = shimmer;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,.24)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(29, 23); ctx.lineTo(29, 91);
    ctx.moveTo(42, 23); ctx.lineTo(42, 58);
    ctx.moveTo(929, 28); ctx.lineTo(929, 76);
    ctx.stroke();
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.fillStyle = p.color;
      if (p.kind === "love") {
        ctx.beginPath();
        ctx.arc(p.x - p.size * .25, p.y, p.size * .35, 0, Math.PI * 2);
        ctx.arc(p.x + p.size * .25, p.y, p.size * .35, 0, Math.PI * 2);
        ctx.lineTo(p.x, p.y + p.size); ctx.fill();
      } else {
        ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(p.size), Math.ceil(p.size));
      }
    });
    ctx.globalAlpha = 1;
  }

  function updateUI(force = false) {
    const stage = stages[state.stage];
    ui.day.textContent = `Day ${state.day}`;
    ui.stage.textContent = stage.name;
    const parts = [`${stage.workers} workers`, `${stage.eggs} eggs`];
    if (stage.larvae) parts.push(`${stage.larvae} larvae`);
    if (stage.winged) parts.push(`${stage.winged} winged`);
    ui.population.textContent = parts.join(" · ");

    meterDefinitions.forEach(([key]) => {
      const value = Math.round(state[key]);
      const fill = document.querySelector(`[data-meter="${key}"]`);
      const label = document.querySelector(`[data-meter-value="${key}"]`);
      fill.style.width = `${value}%`;
      fill.classList.toggle("warn", value < 50 && value >= 25);
      fill.classList.toggle("danger", value < 25);
      label.textContent = value;
    });

    const lightButtons = document.querySelectorAll('[data-action="light"]');
    lightButtons.forEach(button => button.setAttribute("aria-pressed", String(state.lampOn)));
    ui.lightNote.textContent = state.lampOn ? "Lamp is on" : "Lamp is off";

    const mood = getMood();
    ui.face.textContent = mood.face;
    ui.lcdMessage.textContent = mood.short;
    ui.journal.textContent = Date.now() <= state.actionUntil && state.actionMessage
      ? state.actionMessage
      : mood.long;
  }

  function getMood() {
    const night = isNight();
    if (state.health < 25) return { face: "×﹏×", short: "Needs care", long: "The colony is weak. Food and water should come first." };
    if (state.water < 28) return { face: "•︵•", short: "Very thirsty", long: "The nursery is dry and the workers are searching for water." };
    if (state.food < 28) return { face: "•﹏•", short: "Very hungry", long: "The pantry is almost empty. The workers need fresh food." };
    if (state.cleanliness < 28) return { face: "ಠ_ಠ", short: "Needs cleaning", long: "The waste corner is full. A quick cleaning will protect their health." };
    if (state.happiness < 30) return { face: "•︿•", short: "Misses you", long: "The ants are cared for, but a little attention would lift the colony." };
    if (night && !state.lampOn) return { face: "−ᴗ−", short: "Resting", long: "Most workers are resting while a quiet night crew tends the eggs." };
    if (state.stage >= 4) return { face: "★ᴗ★", short: "Thriving!", long: "The mature colony is bustling, and winged ants have appeared." };
    if (state.health > 82) return { face: "•ᴗ•", short: "Digging happily", long: "Healthy workers are carrying food and extending the tunnels." };
    return { face: "•‿•", short: "Doing well", long: "The colony is comfortable and making steady progress." };
  }

  function isNight() {
    const hour = (state.gameMinutes / 60) % 24;
    return hour < 6 || hour >= 19;
  }

  function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
  function average(...values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
})();
