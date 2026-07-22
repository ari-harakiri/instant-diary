(() => {
  "use strict";

  const SAVE_KEY = "little-bowl-save-v1";
  const canvas = document.getElementById("aquarium");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const ui = {
    meters: document.getElementById("meters"),
    day: document.getElementById("day-label"),
    stage: document.getElementById("stage-label"),
    fishLabel: document.getElementById("fish-label"),
    portrait: document.getElementById("portrait"),
    message: document.getElementById("message"),
    saveNote: document.getElementById("save-note"),
    feedNote: document.getElementById("feed-note"),
    foodJar: document.getElementById("food-jar-tool"),
    lightNote: document.getElementById("light-note"),
    cleanNote: document.getElementById("clean-note"),
    cleaningHint: document.getElementById("cleaning-hint"),
    cleaningProgress: document.getElementById("cleaning-progress"),
    bowl: document.getElementById("bowl"),
    help: document.getElementById("help-dialog")
  };

  const meterDefinitions = [
    ["hunger", "Fed"],
    ["water", "Water"],
    ["happiness", "Happy"],
    ["cleanliness", "Clean"],
    ["health", "Health"]
  ];

  const stages = [
    { name: "Fresh little bowl", min: 0, age: "young goldfish" },
    { name: "Coral corner", min: 80, age: "growing goldfish" },
    { name: "Treasure habitat", min: 210, age: "bright goldfish" },
    { name: "Enchanted aquarium", min: 420, age: "thriving goldfish" }
  ];

  const defaultState = () => ({
    version: 1,
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    lastSave: Date.now(),
    gameMinutes: 8 * 60,
    day: 1,
    hunger: 78,
    water: 82,
    happiness: 77,
    cleanliness: 86,
    health: 84,
    energy: 82,
    growth: 0,
    stage: 0,
    lampOn: false,
    actionMessage: "Bubbles is exploring a brand-new home.",
    actionUntil: 0
  });

  let state = loadState();
  let food = [];
  let particles = [];
  let bubbles = [];
  let cleaning = false;
  let cleaningDebris = [];
  let feeding = false;
  let foodShakes = 0;
  const net = { x: 360, y: 240, visible: false };
  let lastFrame = performance.now();
  let lastUi = 0;
  let lastAutoSave = Date.now();
  const fish = { x: 360, y: 235, tx: 500, ty: 200, direction: 1, phase: 0, pause: 0, eating: 0 };
  const debrisSpots = [
    { x: 154, y: 366, r: 7, turn: .2 }, { x: 264, y: 401, r: 6, turn: 1.1 },
    { x: 390, y: 375, r: 8, turn: 2.3 }, { x: 545, y: 408, r: 6, turn: .8 },
    { x: 203, y: 322, r: 6, turn: 1.8 }, { x: 476, y: 337, r: 7, turn: 2.7 },
    { x: 326, y: 421, r: 5, turn: .5 }, { x: 592, y: 352, r: 8, turn: 1.4 },
    { x: 117, y: 410, r: 6, turn: 2.1 }, { x: 433, y: 416, r: 5, turn: .9 },
    { x: 303, y: 346, r: 7, turn: 2.9 }, { x: 518, y: 376, r: 6, turn: .1 }
  ];

  buildMeters();
  applyOfflineProgress();
  syncStage(true);
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
    state.hunger = clamp(state.hunger - awayMinutes * .2);
    state.water = clamp(state.water - awayMinutes * .16);
    state.cleanliness = clamp(state.cleanliness - awayMinutes * .12);
    state.happiness = clamp(state.happiness - awayMinutes * .08);
    const wellbeing = average(state.hunger, state.water, state.cleanliness, state.happiness);
    state.health = clamp(state.health + (wellbeing > 55 ? awayMinutes * .035 : -awayMinutes * .13));
    state.growth += Math.min(100, awaySeconds * (wellbeing / 100) * .04);
    state.gameMinutes += awaySeconds * 2;
    state.day = Math.floor(state.gameMinutes / 1440) + 1;
    state.actionMessage = awaySeconds > 300
      ? `Bubbles spent the time ${wellbeing > 55 ? "swimming and watching bubbles" : "waiting for a little care"}.`
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
    canvas.addEventListener("pointerenter", event => updateNetFromPointer(event));
    canvas.addEventListener("pointermove", event => {
      if (!cleaning) return;
      event.preventDefault();
      updateNetFromPointer(event);
      sweepDebris();
    });
    canvas.addEventListener("pointerleave", () => { net.visible = false; });
    ui.bowl.addEventListener("pointermove", event => updateFoodJarFromPointer(event));
    ui.bowl.addEventListener("pointerleave", () => ui.foodJar.classList.remove("visible"));
    ui.bowl.addEventListener("click", event => {
      if (feeding) sprinkleFood(event);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && cleaning) stopCleaning(false);
      if (event.key === "Escape" && feeding) stopFeeding(false);
    });
    document.getElementById("help-button").addEventListener("click", () => ui.help.showModal());
    document.getElementById("reset-button").addEventListener("click", () => {
      if (!window.confirm("Start a completely new bowl? This removes the current fish-tank save.")) return;
      state = defaultState();
      food = [];
      particles = [];
      bubbles = [];
      stopCleaning(false, true);
      stopFeeding(false, true);
      localStorage.removeItem(SAVE_KEY);
      syncStage(true);
      announce("Bubbles is exploring a brand-new home.");
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
    if (action === "feed") {
      if (feeding) stopFeeding(false);
      else startFeeding();
      updateUI(true);
      return;
    } else if (action === "water") {
      state.water = clamp(state.water + 27);
      state.cleanliness = clamp(state.cleanliness + 6);
      burst("water", 25);
      announce("Fresh water swirls gently through the bowl.");
    } else if (action === "light") {
      state.lampOn = !state.lampOn;
      burst("light", 18);
      announce(state.lampOn ? "The aquarium lamp glows warmly." : "The lamp clicks off for natural rest.");
    } else if (action === "play") {
      state.happiness = clamp(state.happiness + 24);
      state.growth += 7;
      burst("play", 24);
      for (let i = 0; i < 10; i += 1) bubbles.push(makeBubble(fish.x + (Math.random() - .5) * 45, fish.y));
      announce("Bubbles wiggles excitedly and makes a trail of bubbles!");
    } else if (action === "clean") {
      if (cleaning) stopCleaning(false);
      else startCleaning();
      updateUI(true);
      return;
    }
    syncStage();
    updateUI(true);
    saveState(true);
  }

  function startFeeding() {
    if (cleaning) stopCleaning(false, true);
    feeding = true;
    foodShakes = 0;
    ui.bowl.classList.add("feeding");
    announce("Move the food jar over the bowl and click to shake in a small serving.");
    updateUI(true);
  }

  function stopFeeding(completed, silent = false) {
    if (!feeding && !silent) return;
    feeding = false;
    ui.bowl.classList.remove("feeding");
    ui.foodJar.classList.remove("visible", "shaking");
    if (completed) {
      announce("The jar is put away. Bubbles is chasing the colorful flakes!");
      saveState(true);
    } else if (!silent) announce("The food jar is put away for later.");
    updateUI(true);
  }

  function updateFoodJarFromPointer(event) {
    if (!feeding) return;
    const bowlRect = ui.bowl.getBoundingClientRect();
    ui.foodJar.style.left = `${clamp(event.clientX - bowlRect.left, 44, bowlRect.width - 44)}px`;
    ui.foodJar.style.top = `${clamp(event.clientY - bowlRect.top, 56, bowlRect.height * .54)}px`;
    ui.foodJar.classList.add("visible");
  }

  function sprinkleFood(event) {
    if (!feeding || food.length >= 20) return;
    const canvasRect = canvas.getBoundingClientRect();
    const dropX = clamp((event.clientX - canvasRect.left) * canvas.width / canvasRect.width, 80, 640);
    for (let i = 0; i < 2; i += 1) {
      food.push({ x: dropX + (Math.random() - .5) * 35, y: 4 - i * 9, vy: 21 + Math.random() * 13, spin: Math.random() * 6 });
    }
    foodShakes += 1;
    ui.foodJar.classList.remove("shaking");
    void ui.foodJar.offsetWidth;
    ui.foodJar.classList.add("shaking");
    burst("crumb", 7, dropX, 28);
    announce(`A small serving drifts down. ${Math.max(0, 3 - foodShakes)} ${foodShakes === 2 ? "shake" : "shakes"} left.`);
    if (foodShakes >= 3) setTimeout(() => stopFeeding(true), 780);
    updateUI(true);
  }

  function startCleaning() {
    const visibleDebris = getVisibleDebris();
    if (visibleDebris.length === 0) {
      announce("The bowl is already sparkling—there is nothing to scoop yet.");
      burst("clean", 8);
      updateUI(true);
      return;
    }
    cleaning = true;
    net.visible = false;
    cleaningDebris = visibleDebris.map(piece => ({ ...piece }));
    canvas.classList.add("cleaning");
    ui.cleaningHint.classList.add("visible");
    announce("Your cursor is the net—sweep up every little piece in the bowl!");
    updateCleaningUI();
  }

  function stopCleaning(completed, silent = false) {
    if (!cleaning && !silent) return;
    cleaning = false;
    cleaningDebris = [];
    net.visible = false;
    canvas.classList.remove("cleaning");
    ui.cleaningHint.classList.remove("visible");
    if (completed) {
      state.cleanliness = clamp(Math.max(92, state.cleanliness + 32));
      state.water = clamp(state.water + 8);
      state.health = clamp(state.health + 2);
      state.growth += 5;
      burst("clean", 28);
      announce("You caught every speck. The bowl is sparkling clean!");
      syncStage();
      saveState(true);
    } else if (!silent) announce("The net is put away. You can finish cleaning anytime.");
    updateUI(true);
  }

  function updateNetFromPointer(event) {
    if (!cleaning) return;
    const rect = canvas.getBoundingClientRect();
    net.x = clamp((event.clientX - rect.left) * canvas.width / rect.width, 35, canvas.width - 35);
    net.y = clamp((event.clientY - rect.top) * canvas.height / rect.height, 30, canvas.height - 30);
    net.visible = true;
  }

  function sweepDebris() {
    const before = cleaningDebris.length;
    cleaningDebris = cleaningDebris.filter(piece => Math.hypot(piece.x - net.x, piece.y - net.y) > piece.r + 34);
    if (cleaningDebris.length < before) {
      burst("clean", (before - cleaningDebris.length) * 3, net.x, net.y);
      updateCleaningUI();
    }
    if (cleaningDebris.length === 0) stopCleaning(true);
  }

  function updateCleaningUI() {
    ui.cleaningProgress.textContent = `${cleaningDebris.length} ${cleaningDebris.length === 1 ? "piece" : "pieces"} left`;
  }

  function getDirtStage() {
    if (state.cleanliness >= 78) return 0;
    if (state.cleanliness >= 55) return 1;
    if (state.cleanliness >= 32) return 2;
    return 3;
  }

  function getVisibleDebris() {
    const counts = [0, 4, 8, 12];
    return debrisSpots.slice(0, counts[getDirtStage()]);
  }

  function announce(message) {
    state.actionMessage = message;
    state.actionUntil = Date.now() + 8500;
    ui.message.textContent = message;
  }

  function updateSimulation(dt) {
    const seconds = dt / 1000;
    const night = isNight();
    state.gameMinutes += seconds * 2;
    state.day = Math.floor(state.gameMinutes / 1440) + 1;
    state.hunger = clamp(state.hunger - seconds * .019);
    state.water = clamp(state.water - seconds * .014);
    state.cleanliness = clamp(state.cleanliness - seconds * .011);
    state.happiness = clamp(state.happiness - seconds * .008);
    state.energy = clamp(state.energy + seconds * (night && !state.lampOn ? .07 : -.022));
    const wellbeing = average(state.hunger, state.water, state.happiness, state.cleanliness, state.energy);
    state.health = clamp(state.health + (wellbeing - state.health) * seconds * .006);
    if (state.health > 38 && state.hunger > 28 && state.water > 30) state.growth += seconds * .25 * (state.health / 100);
    updateFood(seconds);
    updateFish(seconds, night);
    updateParticles(seconds);
    updateBubbles(seconds);
    syncStage();
  }

  function syncStage(force = false) {
    let next = 0;
    stages.forEach((stage, index) => { if (state.growth >= stage.min) next = index; });
    if (!force && next > state.stage) {
      state.stage = next;
      announce(`${stages[next].name} unlocked! A new decoration appears in the bowl.`);
      burst("growth", 34);
      saveState(true);
    } else state.stage = next;
  }

  function updateFood(dt) {
    food.forEach(flake => {
      flake.y += flake.vy * dt;
      flake.x += Math.sin(flake.spin + flake.y * .035) * 5 * dt;
      flake.spin += dt * 2;
    });
    food = food.filter(flake => flake.y < 445);
  }

  function updateFish(dt, night) {
    fish.phase += dt * (state.happiness > 55 ? 6 : 3.5);
    fish.eating = Math.max(0, fish.eating - dt);
    const sleeping = night && !state.lampOn;
    const nearest = food.reduce((best, flake) => {
      const distance = Math.hypot(flake.x - fish.x, flake.y - fish.y);
      return !best || distance < best.distance ? { flake, distance } : best;
    }, null);

    if (sleeping) {
      fish.tx = 520;
      fish.ty = 395;
    } else if (nearest) {
      fish.tx = nearest.flake.x;
      fish.ty = nearest.flake.y;
      if (nearest.distance < 32) {
        const index = food.indexOf(nearest.flake);
        if (index >= 0) food.splice(index, 1);
        state.hunger = clamp(state.hunger + 6);
        state.health = clamp(state.health + .8);
        state.growth += 1.5;
        fish.eating = .35;
        burst("crumb", 5, fish.x, fish.y);
      }
    } else if (fish.pause <= 0 && Math.hypot(fish.tx - fish.x, fish.ty - fish.y) < 18) {
      fish.tx = 105 + Math.random() * 510;
      fish.ty = 90 + Math.random() * 275;
      fish.pause = Math.random() * 1.6;
    }

    fish.pause = Math.max(0, fish.pause - dt);
    const dx = fish.tx - fish.x;
    const dy = fish.ty - fish.y;
    const pace = sleeping ? .65 : state.health < 35 ? .8 : 1.35;
    fish.direction = dx < -2 ? -1 : dx > 2 ? 1 : fish.direction;
    fish.x += dx * Math.min(1, dt * pace);
    fish.y += dy * Math.min(1, dt * pace);
    // Keep the entire fish inside the bowl's curved glass, not merely its center.
    const fishScale = 1 + state.stage * .045;
    const fishHalfWidth = 87 * fishScale;
    const fishHalfHeight = 52 * fishScale;
    const bowlRadiusX = 350;
    const bowlRadiusY = 232;
    fish.y = clamp(fish.y, 90, 382);
    const farthestVerticalEdge = Math.max(
      Math.abs((fish.y - fishHalfHeight) - 240),
      Math.abs((fish.y + fishHalfHeight) - 240)
    );
    const curvedHalfWidth = bowlRadiusX * Math.sqrt(Math.max(0, 1 - Math.pow(farthestVerticalEdge / bowlRadiusY, 2)));
    fish.x = clamp(fish.x, 360 - curvedHalfWidth + fishHalfWidth, 360 + curvedHalfWidth - fishHalfWidth);
    if (Math.random() < dt * .7) bubbles.push(makeBubble(fish.x - fish.direction * 24, fish.y - 8));
  }

  function makeBubble(x, y) {
    return { x, y, r: 2 + Math.random() * 5, vy: 18 + Math.random() * 25, drift: Math.random() * 6 };
  }

  function updateBubbles(dt) {
    bubbles.forEach(bubble => {
      bubble.y -= bubble.vy * dt;
      bubble.x += Math.sin(bubble.y * .04 + bubble.drift) * 5 * dt;
    });
    bubbles = bubbles.filter(bubble => bubble.y > 12).slice(-70);
  }

  function burst(kind, count, originX = 360, originY = 230) {
    const colors = {
      water: ["#a6eff7", "#3cc5e0", "#e7ffff"],
      light: ["#ffe37c", "#ffc14f", "#fff6ba"],
      play: ["#ff7fb8", "#ffb4d7", "#fff0f8"],
      clean: ["#d5fff2", "#a9dafa", "#ffffff"],
      growth: ["#ffe56e", "#caa9ff", "#73eff2"],
      crumb: ["#f7c24f", "#d3832f", "#fff1a5"]
    };
    for (let i = 0; i < count; i += 1) {
      particles.push({ x: originX + (Math.random() - .5) * 80, y: originY + (Math.random() - .5) * 60, vx: (Math.random() - .5) * 65, vy: -20 - Math.random() * 60, life: .6 + Math.random() * 1.1, size: 2 + Math.random() * 6, color: colors[kind][Math.floor(Math.random() * colors[kind].length)], kind });
    }
  }

  function updateParticles(dt) {
    particles.forEach(particle => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 24 * dt;
      particle.life -= dt;
    });
    particles = particles.filter(particle => particle.life > 0);
  }

  function frame(now) {
    const dt = Math.min(1000, now - lastFrame);
    lastFrame = now;
    updateSimulation(dt);
    drawAquarium(now / 1000, now);
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

  function drawAquarium(time, now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawWaterTint(time);
    drawDecorations(time);
    drawTankDebris();
    drawFood();
    drawBubbles();
    drawFish(time);
    drawParticles();
    if (cleaning && net.visible) drawNet();
    drawNeedBubble();
  }

  function drawWaterTint(time) {
    const dirtStage = getDirtStage();
    if (dirtStage === 0) return;
    const alpha = [0, .075, .17, .28][dirtStage];
    const gradient = ctx.createLinearGradient(0, 20, 0, canvas.height);
    gradient.addColorStop(0, `rgba(84, 172, 88, ${alpha * .45})`);
    gradient.addColorStop(1, `rgba(82, 132, 48, ${alpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgba(156, 192, 79, ${alpha * .7})`;
    const flecks = dirtStage * 6;
    for (let i = 0; i < flecks; i += 1) {
      const x = 70 + ((i * 103 + 37) % 590);
      const y = 70 + ((i * 67 + 19) % 320) + Math.sin(time * .35 + i) * 4;
      ctx.fillRect(Math.round(x), Math.round(y), 2 + (i % 2), 2 + (i % 3));
    }
  }

  function drawDecorations(time) {
    if (state.stage >= 1) drawCoral(112, 408, time);
    if (state.stage >= 2) drawTreasure(548, 401, time);
    if (state.stage >= 3) drawCastle(365, 407, time);
  }

  function drawCoral(x, y, time) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = "#7b244d"; ctx.lineWidth = 13; ctx.lineCap = "round";
    [[0,-47,0,0],[0,-34,-22,-55],[-9,-27,-28,-31],[7,-30,23,-51],[15,-19,36,-29]].forEach(([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2 + Math.sin(time)*2,(y1+y2)/2,x2,y2); ctx.stroke(); });
    ctx.strokeStyle = "#ed5e9b"; ctx.lineWidth = 7;
    [[0,-47,0,0],[0,-34,-22,-55],[-9,-27,-28,-31],[7,-30,23,-51],[15,-19,36,-29]].forEach(([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2,(y1+y2)/2,x2,y2); ctx.stroke(); });
    ctx.restore();
  }

  function drawTreasure(x, y, time) {
    ctx.save();
    ctx.fillStyle = "rgba(22,16,32,.38)";
    ctx.beginPath(); ctx.ellipse(x, y + 1, 50, 11, 0, 0, Math.PI * 2); ctx.fill();

    // Deep outline and stepped lid give the chest a readable pixel silhouette.
    ctx.fillStyle = "#281824";
    ctx.fillRect(x - 43, y - 48, 86, 45);
    ctx.fillRect(x - 39, y - 59, 78, 13);
    ctx.fillRect(x - 34, y - 64, 68, 6);
    ctx.fillStyle = "#6b351c";
    ctx.fillRect(x - 37, y - 43, 74, 34);
    ctx.fillStyle = "#a95d26";
    ctx.fillRect(x - 32, y - 38, 64, 24);
    ctx.fillStyle = "#d17b2d";
    ctx.fillRect(x - 32, y - 38, 64, 7);

    ctx.fillStyle = "#713718";
    ctx.fillRect(x - 33, y - 58, 66, 10);
    ctx.fillStyle = "#bd6b25";
    ctx.fillRect(x - 29, y - 61, 58, 9);
    ctx.fillStyle = "#e18b32";
    ctx.fillRect(x - 22, y - 60, 43, 3);

    // Metal bands and lock make it read immediately as a treasure chest.
    ctx.fillStyle = "#f1c34e";
    ctx.fillRect(x - 28, y - 59, 7, 48);
    ctx.fillRect(x + 21, y - 59, 7, 48);
    ctx.fillStyle = "#fff099";
    ctx.fillRect(x - 26, y - 57, 3, 34);
    ctx.fillStyle = "#43251d";
    ctx.fillRect(x - 9, y - 39, 18, 22);
    ctx.fillStyle = "#f4c945";
    ctx.fillRect(x - 7, y - 37, 14, 17);
    ctx.fillStyle = "#5a321b";
    ctx.fillRect(x - 2, y - 31, 4, 8);

    // A tiny gem and restrained glint keep the static prop feeling alive.
    ctx.fillStyle = "#4bd2dd";
    ctx.fillRect(x + 32, y - 23, 7, 7);
    ctx.fillStyle = `rgba(255,244,157,${.45 + Math.sin(time * 2.4) * .3})`;
    ctx.fillRect(x + 38, y - 68, 3, 13);
    ctx.fillRect(x + 33, y - 63, 13, 3);
    ctx.restore();
  }

  function drawCastle(x, y, time) {
    ctx.save();
    ctx.fillStyle = "rgba(21,17,45,.4)";
    ctx.beginPath(); ctx.ellipse(x, y + 1, 75, 13, 0, 0, Math.PI * 2); ctx.fill();

    const dark = "#252653";
    const stone = "#777aa7";
    const lightStone = "#a1a6c9";
    const shade = "#555985";
    const roof = "#3158bc";
    const roofLight = "#4c81dc";

    // Central keep and two stepped towers.
    ctx.fillStyle = dark;
    ctx.fillRect(x - 48, y - 65, 96, 65);
    ctx.fillRect(x - 70, y - 83, 34, 83);
    ctx.fillRect(x + 36, y - 83, 34, 83);
    ctx.fillStyle = stone;
    ctx.fillRect(x - 43, y - 60, 86, 57);
    ctx.fillRect(x - 65, y - 78, 24, 75);
    ctx.fillRect(x + 41, y - 78, 24, 75);
    ctx.fillStyle = lightStone;
    ctx.fillRect(x - 60, y - 73, 7, 64);
    ctx.fillRect(x - 38, y - 55, 8, 46);
    ctx.fillRect(x + 46, y - 73, 6, 64);
    ctx.fillStyle = shade;
    ctx.fillRect(x - 48, y - 16, 96, 13);

    // Blue roofs with highlighted left edges.
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(x - 75, y - 80); ctx.lineTo(x - 53, y - 111); ctx.lineTo(x - 31, y - 80); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 31, y - 80); ctx.lineTo(x + 53, y - 111); ctx.lineTo(x + 75, y - 80); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(x - 69, y - 82); ctx.lineTo(x - 53, y - 105); ctx.lineTo(x - 37, y - 82); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 37, y - 82); ctx.lineTo(x + 53, y - 105); ctx.lineTo(x + 69, y - 82); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roofLight;
    ctx.beginPath(); ctx.moveTo(x - 65, y - 83); ctx.lineTo(x - 53, y - 101); ctx.lineTo(x - 51, y - 83); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 41, y - 83); ctx.lineTo(x + 53, y - 101); ctx.lineTo(x + 55, y - 83); ctx.closePath(); ctx.fill();

    // Pixel stones, glowing windows, and an arched doorway add depth.
    ctx.fillStyle = "#c1c6df";
    [[-31,-49,14,5],[8,-53,17,5],[-58,-33,10,5],[48,-43,11,5],[-27,-24,12,5],[19,-31,14,5]].forEach(([sx,sy,sw,sh]) => ctx.fillRect(x + sx, y + sy, sw, sh));
    ctx.fillStyle = dark;
    ctx.fillRect(x - 59, y - 63, 12, 18);
    ctx.fillRect(x + 47, y - 63, 12, 18);
    ctx.fillStyle = "#6ce1ec";
    ctx.fillRect(x - 56, y - 60, 6, 10);
    ctx.fillRect(x + 50, y - 60, 6, 10);
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(x, y - 19, 17, Math.PI, 0); ctx.lineTo(x + 17, y); ctx.lineTo(x - 17, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3a315a";
    ctx.beginPath(); ctx.arc(x, y - 17, 10, Math.PI, 0); ctx.lineTo(x + 10, y); ctx.lineTo(x - 10, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#c6c9df";
    ctx.fillRect(x - 2, y - 12, 3, 10);

    // Two slow bubbles keep the ornament subtly underwater without distracting.
    ctx.strokeStyle = `rgba(218,250,255,${.45 + Math.sin(time * 1.5) * .18})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + 65, y - 112 - Math.sin(time) * 3, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 74, y - 126 - Math.cos(time * .8) * 3, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawFood() {
    food.forEach(flake => {
      ctx.save(); ctx.translate(Math.round(flake.x), Math.round(flake.y)); ctx.rotate(flake.spin);
      ctx.fillStyle = "#7b381c"; ctx.fillRect(-5, -4, 10, 8);
      ctx.fillStyle = "#f0b63e"; ctx.fillRect(-4, -3, 7, 5);
      ctx.restore();
    });
  }

  function drawBubbles() {
    bubbles.forEach(bubble => {
      ctx.strokeStyle = "rgba(224,252,255,.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.65)"; ctx.fillRect(bubble.x - bubble.r * .35, bubble.y - bubble.r * .45, 2, 2);
    });
  }

  function drawFish(time) {
    const mood = getMood();
    const sleeping = isNight() && !state.lampOn;
    const blinking = !sleeping && Math.sin(time * .82 + .7) > .965;
    const scale = 1 + state.stage * .045;
    const bob = sleeping ? 0 : Math.sin(fish.phase) * (state.happiness > 55 ? 4 : 2);
    const tailWag = sleeping ? 0 : Math.sin(time * 7.2 + fish.phase * .3) * 6;
    const finWag = sleeping ? 0 : Math.sin(time * 5.4 + fish.phase * .2) * 1.5;
    ctx.save();
    ctx.translate(Math.round(fish.x), Math.round(fish.y + bob));
    ctx.scale(fish.direction * scale, scale);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#4b1f13";
    ctx.lineWidth = 5;
    // Flexible tail with a warm inner panel instead of one flat triangle.
    ctx.fillStyle = "#f07819";
    ctx.beginPath(); ctx.moveTo(-43, -3); ctx.lineTo(-79, -31 + tailWag); ctx.lineTo(-72, 5 + tailWag * .35); ctx.lineTo(-79, 35 + tailWag); ctx.lineTo(-42, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff9c29";
    ctx.beginPath(); ctx.moveTo(-48, 1); ctx.lineTo(-71, -21 + tailWag); ctx.lineTo(-66, 4 + tailWag * .3); ctx.lineTo(-71, 25 + tailWag); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#b84a17"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-66, -18 + tailWag); ctx.lineTo(-55, 2); ctx.lineTo(-68, 22 + tailWag); ctx.stroke();

    // Fins attached behind the body: the body hides their bases naturally.
    ctx.strokeStyle = "#4b1f13"; ctx.lineWidth = 4;
    ctx.fillStyle = "#e56318";
    ctx.beginPath();
    ctx.moveTo(-17, -28);
    ctx.quadraticCurveTo(-5, -50, 8, -55);
    ctx.quadraticCurveTo(20, -47, 29, -27);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f68720";
    ctx.beginPath(); ctx.moveTo(-8, -31); ctx.quadraticCurveTo(1, -46, 8, -49); ctx.quadraticCurveTo(16, -43, 21, -30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e56318";
    ctx.beginPath();
    ctx.moveTo(-9, 28);
    ctx.quadraticCurveTo(4, 50, 25, 27);
    ctx.quadraticCurveTo(8, 34, -9, 28);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Layered body shading keeps the original silhouette but adds depth.
    ctx.strokeStyle = "#4b1f13"; ctx.lineWidth = 5;
    ctx.fillStyle = "#ff941f";
    ctx.beginPath(); ctx.ellipse(0, 0, 54, 39, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, 50, 35, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#e96a18";
    ctx.beginPath(); ctx.ellipse(-3, 27, 51, 25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffb33d";
    ctx.beginPath(); ctx.ellipse(1, -21, 38, 13, -.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,230,128,.72)";
    ctx.beginPath(); ctx.ellipse(17, -22, 17, 6, -.12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#ffb13c";
    ctx.beginPath(); ctx.ellipse(10, 10, 36, 21, -.15, 0, Math.PI * 2); ctx.fill();

    // Small pectoral fin: attached near the gill and pointing backward.
    ctx.strokeStyle = "#a94218"; ctx.lineWidth = 2.5;
    ctx.fillStyle = "#ed721b";
    ctx.beginPath();
    ctx.moveTo(10, 8);
    ctx.quadraticCurveTo(1, 13 + finWag, -11, 22);
    ctx.quadraticCurveTo(2, 22 + finWag * .35, 13, 14);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#ffad36"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(7, 12); ctx.lineTo(-4, 19 + finWag * .25); ctx.stroke();

    // Gill, scales, and cheek are deliberately restrained at this small size.
    ctx.strokeStyle = "#b84918"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(17, 3, 18, -1.1, 1.05); ctx.stroke();
    [[-19,-11],[-30,2],[-17,10]].forEach(([sx, sy]) => {
      ctx.beginPath(); ctx.arc(sx, sy, 6, .15, 1.35); ctx.stroke();
    });
    ctx.fillStyle = "rgba(239,83,39,.55)";
    ctx.beginPath(); ctx.arc(36, 8, 5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#fff8d7";
    if (sleeping || blinking) {
      ctx.strokeStyle = "#3d2117"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(19, -8); ctx.quadraticCurveTo(29, -1, 38, -8); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(27, -10, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#231716"; ctx.beginPath(); ctx.arc(31, -9, mood.sad ? 5 : 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(31, -13, 3, 3);
    }
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.fillRect(-14, -25, 11, 3);
    ctx.strokeStyle = "#542016"; ctx.lineWidth = 3;
    ctx.beginPath();
    if (fish.eating > 0) ctx.arc(49, 8, 7, 0, Math.PI * 2);
    else if (mood.sad) ctx.arc(43, 13, 8, Math.PI * 1.1, Math.PI * 1.9);
    else ctx.arc(43, 3, 9, .2, 1.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.min(1, p.life * 1.5); ctx.fillStyle = p.color;
      if (p.kind === "play") {
        ctx.beginPath(); ctx.arc(p.x - p.size * .25, p.y, p.size * .35, 0, Math.PI * 2); ctx.arc(p.x + p.size * .25, p.y, p.size * .35, 0, Math.PI * 2); ctx.lineTo(p.x, p.y + p.size); ctx.fill();
      } else ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(p.size), Math.ceil(p.size));
    });
    ctx.globalAlpha = 1;
  }

  function drawTankDebris() {
    const pieces = cleaning ? cleaningDebris : getVisibleDebris();
    pieces.forEach(piece => {
      ctx.save(); ctx.translate(Math.round(piece.x), Math.round(piece.y)); ctx.rotate(piece.turn);
      ctx.fillStyle = "#5b4123"; ctx.fillRect(-piece.r, -piece.r * .55, piece.r * 2, piece.r * 1.1);
      ctx.fillStyle = "#8b6a32"; ctx.fillRect(-piece.r * .5, -piece.r * .35, piece.r * .8, piece.r * .45);
      ctx.restore();
    });
  }

  function drawNet() {
    const x = net.x;
    const y = net.y;
    ctx.strokeStyle = "#163f78"; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x + 55, y - 72); ctx.lineTo(x, y); ctx.stroke();
    ctx.strokeStyle = "#dff8ff"; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x, y, 31, 23, -.7, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(220,248,255,.62)"; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i += 1) { ctx.beginPath(); ctx.moveTo(x - 22, y + i * 7); ctx.lineTo(x + 22, y + i * 7); ctx.stroke(); }
  }

  function drawNeedBubble() {
    const mood = getMood();
    if (!mood.action) return;
    const bubbleX = clamp(fish.x + fish.direction * 65, 75, 645);
    const bubbleY = clamp(fish.y - 78, 45, 370);
    ctx.fillStyle = "#efffff"; ctx.strokeStyle = "#153a6a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(bubbleX - 24, bubbleY - 20, 48, 39, 10); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bubbleX - 7, bubbleY + 18); ctx.lineTo(bubbleX, bubbleY + 29); ctx.lineTo(bubbleX + 6, bubbleY + 18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#123252"; ctx.font = "bold 22px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(mood.icon, bubbleX, bubbleY); ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }

  function updateUI(force = false) {
    const stage = stages[state.stage];
    ui.day.textContent = `Day ${state.day}`;
    ui.stage.textContent = stage.name;
    ui.fishLabel.textContent = `Bubbles · ${stage.age}`;
    meterDefinitions.forEach(([key]) => {
      const value = Math.round(state[key]);
      const fill = document.querySelector(`[data-meter="${key}"]`);
      const label = document.querySelector(`[data-meter-value="${key}"]`);
      fill.style.width = `${value}%`;
      fill.classList.toggle("warn", value < 50 && value >= 25);
      fill.classList.toggle("danger", value < 25);
      label.textContent = value;
    });
    document.querySelectorAll('[data-action="light"]').forEach(button => button.setAttribute("aria-pressed", String(state.lampOn)));
    document.querySelectorAll('[data-action="feed"]').forEach(button => button.setAttribute("aria-pressed", String(feeding)));
    document.querySelectorAll('[data-action="clean"]').forEach(button => button.setAttribute("aria-pressed", String(cleaning)));
    ui.lightNote.textContent = state.lampOn ? "Lamp is on" : "Lamp is off";
    ui.feedNote.textContent = feeding ? `${Math.max(0, 3 - foodShakes)} shakes remaining` : "Pick up the food jar";
    const dirtStage = getDirtStage();
    ui.cleanNote.textContent = cleaning
      ? "Move through every speck"
      : ["Tank is spotless", "A few specks to scoop", "Tank needs cleaning", "A messy tank to clean"][dirtStage];
    ui.bowl.classList.toggle("night", isNight() && !state.lampOn);
    ui.bowl.classList.toggle("lamp", state.lampOn);
    const mood = getMood();
    ui.portrait.textContent = mood.face;
    ui.message.textContent = Date.now() <= state.actionUntil && state.actionMessage ? state.actionMessage : mood.message;
    document.querySelectorAll(".care-card").forEach(button => button.classList.toggle("needs-attention", button.dataset.action === mood.action));
  }

  function getMood() {
    if (state.health < 25) return { face: "×﹏×", message: "I feel weak. Please check my food and water first.", action: state.hunger < state.water ? "feed" : "water", icon: "!", sad: true };
    if (state.hunger < 30) return { face: "•﹏•", message: "My tummy is making tiny bubbles. Could I have some flakes?", action: "feed", icon: "◆", sad: true };
    if (state.water < 30) return { face: "•︵•", message: "The water feels stale. Could you freshen it?", action: "water", icon: "●", sad: true };
    if (state.cleanliness < 30) return { face: "ಠ_ಠ", message: "There is too much mess near my gravel.", action: "clean", icon: "✦", sad: true };
    if (state.happiness < 32) return { face: "•︿•", message: "Will you stay and make bubbles with me?", action: "play", icon: "♥", sad: true };
    if (isNight() && !state.lampOn) return { face: "−ᴗ−", message: "Good night. I am resting near the warm gravel.", action: null, icon: "z", sad: false };
    if (state.stage >= 3) return { face: "★ᴗ★", message: "Look at our magical aquarium! I love it here.", action: null, icon: "★", sad: false };
    if (state.health > 82) return { face: "•ᴗ•", message: "This water feels wonderful! Watch me swim.", action: null, icon: "○", sad: false };
    return { face: "•‿•", message: "I am doing well. Maybe we can make bubbles later.", action: null, icon: "○", sad: false };
  }

  function isNight() {
    const hour = (state.gameMinutes / 60) % 24;
    return hour < 6 || hour >= 19;
  }

  function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
  function average(...values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
})();
