(function(){
  var bootLoaderLoadingMs = 1800;
  var bootSound;
  var bootSoundPlayed = false;
  var bootSoundInFlight = false;
  var bootSoundRetryArmed = false;
  var loaderDismissRequestedAt = 0;

  var bar = document.getElementById('dd-loader-bar');
  var msg = document.getElementById('dd-loader-msg');
  var loaderKoba = document.getElementById('dd-loader-puppy');
  var loaderWrap = document.getElementById('dd-loader');

  var msgs=['INITIALIZING','LOADING ASSETS','PREPARING DESKTOP','RESTORING SESSION','ALMOST THERE'];

  var loaderStartTs = 0;
  var loaderProgressDone = false;
  var loaderHideReady = false;
  var bootCanHideLoader = false;
  var bootLoaderHidden = false;
  var userReadyToDismissLoader = false;
  var loaderHideTriggered = false;
  var loaderHideRetries = 0;
  var loaderDismissTimeoutId = 0;
  var loaderFallbackForced = false;
  var loaderBlackFadeArmed = false;
  var loaderRevealInProgress = false;
  var loaderVisualFallbackScheduled = false;
  window.__ddStartupLoaderDismissed = false;
  var startupRecoveryPasses = 0;
  var loaderStartupRecoveryMaxPasses = 10;
  var loaderBlackFadeHoldMs = 920;
  var loaderDismissDelayMs = loaderBlackFadeHoldMs;
  var loaderDismissForcedByClick = false;
  var ddBootLockClass = 'dd-booting';
  var startupLockReleased = false;

  if(typeof window.__ddStartupBlockersClear !== 'function'){
    window.__ddStartupBlockersClear = function(){};
  }

  window.__ddBootLoadingDurationMs = bootLoaderLoadingMs;

  function forceLoaderSurfaceRevealNow(){
    if(loaderVisualFallbackScheduled === 'complete') return;

    if(document.body){
      document.body.classList.remove(ddBootLockClass);
    }
    if(loaderWrap){
      loaderWrap.style.display = 'none';
      loaderWrap.style.pointerEvents = 'none';
      loaderWrap.style.opacity = '0';
    }

    if(typeof window.__ddForceStartupSurface === 'function'){
      try {
        window.__ddForceStartupSurface();
      } catch (e) {}
    } else {
      var signon = document.getElementById('signon-wrap');
      var taskbar = document.getElementById('taskbar');
      var desktop = document.getElementById('desktop');
      if(signon){
        signon.style.display = 'block';
        signon.style.visibility = 'visible';
        signon.style.opacity = '1';
        signon.style.pointerEvents = 'auto';
      }
      if(taskbar){
        taskbar.style.display = 'flex';
        taskbar.style.visibility = 'visible';
        taskbar.style.pointerEvents = 'auto';
      }
      if(desktop){
        desktop.style.display = 'block';
        desktop.style.visibility = 'visible';
        desktop.style.pointerEvents = 'auto';
      }
    }

    if(typeof window.__ddStartupInteractivity === 'function'){
      try {
        window.__ddStartupInteractivity();
      } catch (e) {}
    }
    if(typeof window.__ddStartupBlockersClear === 'function'){
      try {
        window.__ddStartupBlockersClear();
      } catch (e) {}
    }
    if(typeof window.__ddRunStartupRecovery === 'function'){
      try {
        window.__ddRunStartupRecovery();
      } catch (e) {}
    }
    loaderVisualFallbackScheduled = 'complete';
  }

  function forceSignonRevealNow(){
    if(document.body && document.body.classList){
      document.body.classList.remove('signed-in');
      document.body.style.pointerEvents = 'auto';
      if(document.documentElement){
        document.documentElement.style.pointerEvents = 'auto';
      }
    }

    var signon = document.getElementById('signon-wrap');
    var taskbar = document.getElementById('taskbar');
    var desktop = document.getElementById('desktop');
    var connecting = document.getElementById('connecting-wrap');

    if(signon){
      signon.style.display = 'block';
      signon.style.visibility = 'visible';
      signon.style.opacity = '1';
      signon.style.pointerEvents = 'auto';
      signon.style.zIndex = '120000';
      signon.style.position = 'relative';
    }
    if(taskbar){
      taskbar.style.display = 'flex';
      taskbar.style.visibility = 'visible';
      taskbar.style.pointerEvents = 'auto';
    }
    if(desktop){
      desktop.style.display = 'block';
      desktop.style.visibility = 'visible';
      desktop.style.pointerEvents = 'none';
    }
    if(connecting){
      connecting.style.display = 'none';
    }

    if(typeof window.__ddStartupInteractivity === 'function'){
      try {
        window.__ddStartupInteractivity();
      } catch (e) {}
    }
    if(typeof window.__ddStartupBlockersClear === 'function'){
      try {
        window.__ddStartupBlockersClear();
      } catch (e) {}
    }
  }

  function scheduleLoaderVisualFallback(){
    if(loaderVisualFallbackScheduled) return;
    loaderVisualFallbackScheduled = true;
    setTimeout(forceLoaderSurfaceRevealNow, 260);
    setTimeout(forceLoaderSurfaceRevealNow, 1200);
    setTimeout(forceLoaderSurfaceRevealNow, 2400);
  }

  function setStartupBootLock(active){
    if(!document.body || !document.body.classList) return;
    if(active){
      document.body.classList.add(ddBootLockClass);
    } else {
      document.body.classList.remove(ddBootLockClass);
    }
  }

  setStartupBootLock(true);

  function releaseStartupLock(){
    if(startupLockReleased) return;
    startupLockReleased = true;
    setStartupBootLock(false);
    try {
      if(typeof window.__ddEnsureStartupVisible === 'function'){
        window.__ddEnsureStartupVisible();
      } else if(typeof window.__ddStartupInteractivity === 'function'){
        window.__ddStartupInteractivity();
      }
    } catch (e) {}
    if(typeof window.__ddStartupBlockersClear === 'function'){
      try {
        window.__ddStartupBlockersClear();
      } catch (e) {}
    }
  }

  function fadeLoaderToBlack(){
    if(!loaderWrap || loaderBlackFadeArmed) return;
    loaderBlackFadeArmed = true;
    var currentTransition = loaderWrap.style.transition || '';
    if(currentTransition.indexOf('opacity') === -1){
      loaderWrap.style.transition = currentTransition
        ? currentTransition + ', opacity 0.72s ease'
        : 'opacity 0.72s ease';
    }
  }

  function hardenStartupSurface(){
    fadeLoaderToBlack();
    if(loaderWrap){
      loaderWrap.style.pointerEvents = 'none';
    }

    if(typeof window.__ddForceStartupSurface === 'function'){
      try {
        window.__ddForceStartupSurface();
      } catch (e) {}
    }
    if(typeof window.__ddEnsureStartupVisible === 'function'){
      try {
        window.__ddEnsureStartupVisible();
      } catch (e) {}
    }
    if(typeof window.__ddStartupBlockersClear === 'function'){
      try {
        window.__ddStartupBlockersClear();
      } catch (e) {}
    }
    if(typeof window.__ddStartupInteractivity === 'function'){
      try {
        window.__ddStartupInteractivity();
      } catch (e) {}
    }

    forceLoaderInteractionRecovery();
  }

  function runStartupRecoveryPass(){
    if(!bootLoaderHidden) return;
    if(startupRecoveryPasses >= loaderStartupRecoveryMaxPasses) return;
    startupRecoveryPasses += 1;
    try {
      if(typeof window.__ddStartupInteractivity === 'function'){
        window.__ddStartupInteractivity();
      }
      if(typeof window.__ddForceStartupSurface === 'function'){
        window.__ddForceStartupSurface();
      } else if(typeof window.__ddEnsureStartupVisible === 'function'){
        window.__ddEnsureStartupVisible();
      } else if(typeof window.__ddStartupBlockersClear === 'function'){
        window.__ddStartupBlockersClear();
      }
    } catch (e) {}
    if(startupRecoveryPasses >= loaderStartupRecoveryMaxPasses) return;
    setTimeout(runStartupRecoveryPass, 140);
  }

  function isStartupSurfaceReadyToReveal(){
    if(typeof window.__ddIsStartupSurfaceReady !== 'function'){
      return !!bootCanHideLoader;
    }
    try {
      return !!window.__ddIsStartupSurfaceReady();
    } catch (e) {
      return false;
    }
  }

  function markDismissRequested(){
    loaderHideRequestedAt = performance.now();
    loaderHideRetries = 0;
  }

  function shouldForceHideLoader(){
    if(loaderHideRequestedAt <= 0) return false;
    return (performance.now() - loaderHideRequestedAt) >= 3000;
  }

  function hideLoader(){
    if(bootLoaderHidden) return;
    window.__ddStartupLoaderDismissed = true;
    bootLoaderHidden = true;
    loaderHideTriggered = true;
    loaderDismissForcedByClick = false;
    window.__ddLoaderHidden = true;
    if(loaderDismissTimeoutId){
      clearTimeout(loaderDismissTimeoutId);
      loaderDismissTimeoutId = 0;
    }
    if(loaderRevealInProgress) return;
    loaderRevealInProgress = true;
    startupRecoveryPasses = 0;
    hardenStartupSurface();
    runStartupRecoveryPass();

    var fadeDelayMs = (typeof loaderDismissDelayMs === 'number' && loaderDismissDelayMs >= 0)
      ? loaderDismissDelayMs
      : loaderBlackFadeHoldMs;
    if(loaderWrap){
      loaderWrap.style.opacity = '1';
      loaderWrap.style.pointerEvents = 'none';
      void loaderWrap.offsetWidth;

      setTimeout(function(){
        if(loaderWrap){
          loaderWrap.style.opacity = '0';
        }
      }, fadeDelayMs);

      setTimeout(function(){
        if(loaderWrap){
          forceSignonRevealNow();
          loaderWrap.style.display = 'none';
          releaseStartupLock();
          loaderVisualFallbackScheduled = false;
          scheduleLoaderVisualFallback();
          runStartupRecoveryPass();
        }
      }, fadeDelayMs + 760);
    }

    loaderDismissDelayMs = loaderBlackFadeHoldMs;
  }

  function updateLoadingText(progress){
    var idx = Math.min(msgs.length - 1, Math.floor(progress * msgs.length));
    var isContinue = progress >= 1;
    msg.textContent = msgs[idx];
    if(isContinue){
      msg.textContent = 'CLICK TO CONTINUE';
      msg.style.color = '#ff3cb7';
      return;
    }
    msg.style.color = '#2a5f80';
  }

  function syncLoaderKobaTurn(){
    if(!loaderKoba) return;
    var imageUrl = 'companions/sprites/koba/New-loading-nobg.PNG';
    loaderKoba.style.backgroundImage = "url('" + imageUrl + "')";
    loaderKoba.style.backgroundRepeat = 'no-repeat';
    loaderKoba.style.imageRendering = 'pixelated';

    var frameStartTs = performance.now();
    var frameCount = 5;
    var frameRenderWidth = 0;

    function setStaticFrame(){
      loaderKoba.style.backgroundSize = '100% 100%';
      loaderKoba.style.backgroundPosition = '0 0';
      loaderKoba.style.animation = 'none';
    }

    function stepFrame(timestamp){
      if(!frameCount || frameCount < 2) return;
      if(bootLoaderHidden) return;

      var elapsed = Math.max(0, timestamp - frameStartTs);
      var frameIdx = Math.min(frameCount - 1, Math.floor((elapsed / bootLoaderLoadingMs) * frameCount));
      var targetPos = -(frameIdx * frameRenderWidth);
      loaderKoba.style.backgroundPosition = targetPos + 'px 0';

      if(elapsed >= bootLoaderLoadingMs){
        loaderKoba.style.backgroundPosition = (-(frameCount - 1) * frameRenderWidth) + 'px 0';
        return;
      }
      requestAnimationFrame(stepFrame);
    }

    var img = new Image();
    img.onload = function(){
      var frameWidth = img.naturalWidth / frameCount;
      var frameHeight = img.naturalHeight;
      var maxDisplayHeight = 220;
      var scale = frameHeight > 0 ? Math.min(1, maxDisplayHeight / frameHeight) : 1;
      frameRenderWidth = Math.round(frameWidth * scale);

      loaderKoba.style.width = Math.round(frameWidth * scale) + 'px';
      loaderKoba.style.height = Math.round(frameHeight * scale) + 'px';

      if(!frameRenderWidth || !frameHeight){
        setStaticFrame();
        return;
      }

      loaderKoba.style.backgroundSize = (img.naturalWidth * scale) + 'px ' + (frameHeight * scale) + 'px';
      loaderKoba.style.animation = 'none';
      requestAnimationFrame(stepFrame);
    };
    img.onerror = function(){
      setStaticFrame();
    };
    img.src = imageUrl;
  }

  function markLoaderProgressDone(){
    if(loaderProgressDone) return;
    loaderProgressDone = true;
    fadeLoaderToBlack();
    updateLoadingText(1);
    attemptLoaderDismiss();
  }

  function runLoaderProgress(){
    loaderStartTs = performance.now();
    msg.textContent = msgs[0];
    bar.style.width = '0%';

    (function tick(now){
      if(bootLoaderHidden) return;
      var raw = (now - loaderStartTs) / bootLoaderLoadingMs;
      var progress = Math.min(1, raw);
      var eased = 1 - Math.pow(1 - progress, 3);
      bar.style.width = Math.round(eased * 100) + '%';
      updateLoadingText(progress);

      if(progress >= 1){
        markLoaderProgressDone();
        return;
      }
      requestAnimationFrame(tick);
    })(loaderStartTs);
  }

  function playBootSound(){
    if(bootSoundPlayed || bootSoundInFlight) return;
    bootSoundInFlight = true;
    if(bootSound){
      bootSound.pause();
      bootSound = null;
    }

    var candidates = [
      'source-assets/audio/originals/log%20on.wav',
      'source-assets/audio/originals/Windows%20XP%20login.wav'
    ];

    var armRetry = function(){
      if(bootSoundRetryArmed || bootSoundPlayed) return;
      bootSoundRetryArmed = true;
      var retry = function(){
        if(bootSoundRetryArmed){
          bootSoundRetryArmed = false;
          window.removeEventListener('pointerdown', retry);
          window.removeEventListener('mousedown', retry);
          window.removeEventListener('keydown', retry);
          window.removeEventListener('touchstart', retry);
          playBootSound();
        }
      };
      window.addEventListener('pointerdown', retry, { once: true });
      window.addEventListener('mousedown', retry, { once: true });
      window.addEventListener('keydown', retry, { once: true });
      window.addEventListener('touchstart', retry, { once: true });
      window.addEventListener('click', retry, { once: true });
      window.addEventListener('pointermove', retry, { once: true });
      window.addEventListener('focus', retry, { once: true });
      window.addEventListener('visibilitychange', function(){
        if(document.visibilityState === 'visible'){ retry(); }
      }, { once: true });
    };

    var tryPlay = function(index){
      if(index >= candidates.length){
        bootSoundInFlight = false;
        armRetry();
        return;
      }
      bootSound = new Audio(candidates[index]);
      bootSound.muted = true;
      bootSound.volume = 0;
      bootSound.preload = 'auto';
      bootSound.autoplay = false;
      bootSound.playsInline = true;
      bootSound.load();
      bootSound.currentTime = 0;
      bootSound.play().then(function(){
        fadeLoaderToBlack();
        bootSoundPlayed = true;
        bootSoundInFlight = false;
        setTimeout(function(){
          if(!bootSound) return;
          bootSound.muted = false;
          bootSound.volume = 0.85;
        }, 80);
      }).catch(function(){
        tryPlay(index + 1);
      });
    };

    tryPlay(0);
  }

  function markLoaderHideRequest(){
    bootCanHideLoader = true;
    markDismissRequested();
    attemptLoaderDismiss();
  }

  function forceStartupFromLoader(){
    if(loaderFallbackForced) return;
    loaderFallbackForced = true;
    releaseStartupLock();
    fadeLoaderToBlack();
    if(!loaderWrap) return hideLoader();

    setTimeout(function(){
      if(typeof window.__ddForceStartupSurface === 'function'){
        try {
          window.__ddForceStartupSurface();
        } catch (e) {}
      } else {
        document.body.classList.remove('signed-in');
        var signonFallback = document.getElementById('signon-wrap');
        var connectingFallback = document.getElementById('connecting-wrap');
        var taskbarFallback = document.getElementById('taskbar');
        var desktopFallback = document.getElementById('desktop');
        if(signonFallback){
          signonFallback.style.display = 'block';
          signonFallback.style.visibility = 'visible';
          signonFallback.style.opacity = '1';
          signonFallback.style.pointerEvents = 'auto';
        }
        if(connectingFallback) connectingFallback.style.display = 'none';
        if(taskbarFallback){
          taskbarFallback.style.display = 'flex';
          taskbarFallback.style.visibility = 'visible';
          taskbarFallback.style.pointerEvents = 'auto';
        }
        if(desktopFallback) desktopFallback.style.pointerEvents = 'auto';
      }
      hideLoader();
    }, 120);
  }

function forceLoaderInteractionRecovery(){
    if(loaderWrap){
      loaderWrap.style.pointerEvents = 'none';
    }
    if(document.body){
      document.body.style.pointerEvents = '';
    }
    var bodyChildren = Array.prototype.slice.call(document.body ? document.body.children : []);
    for(var i = 0; i < bodyChildren.length; i++){
      var node = bodyChildren[i];
      if(!node || node === loaderWrap) continue;
      try {
        var style = getComputedStyle(node);
        var zIndex = parseInt(style.zIndex, 10);
        if(style.position !== 'fixed') continue;
        if(style.left !== '0px' || style.top !== '0px' || style.right !== '0px' || style.bottom !== '0px') continue;
        if(isNaN(zIndex) || zIndex < 100000) continue;
        if(node.id === 'taskbar' || node.id === 'desktop' || node.id === 'signon-wrap' || node.id === 'connecting-wrap') continue;
        node.style.pointerEvents = 'none';
      } catch (e) {}
    }
    if(typeof window.__ddStartupBlockersClear === 'function'){
      try {
        window.__ddStartupBlockersClear();
      } catch (e) {}
    }
  }

  function requestLoaderDismiss(){
    loaderDismissDelayMs = 0;
    loaderDismissForcedByClick = true;
    loaderHideReady = true;
    bootCanHideLoader = true;
    releaseStartupLock();
    forceSignonRevealNow();
    fadeLoaderToBlack();
    window.__ddStartupLoaderDismissed = true;
    userReadyToDismissLoader = true;
    markDismissRequested();
    if(typeof window.__ddForceStartupSurface === 'function'){
      try {
        window.__ddForceStartupSurface();
      } catch (e) {}
    } else if(typeof window.__ddEnsureStartupVisible === 'function'){
      try {
        window.__ddEnsureStartupVisible();
      } catch (e) {}
    }
    if(typeof window.__ddStartupInteractivity === 'function'){
      try {
        window.__ddStartupInteractivity();
      } catch (e) {}
    }
    if(typeof window.__ddStartupBlockersClear === 'function'){
      try {
        window.__ddStartupBlockersClear();
      } catch (e) {}
    }
    runStartupRecoveryPass();
    if(loaderDismissTimeoutId){
      clearTimeout(loaderDismissTimeoutId);
      loaderDismissTimeoutId = 0;
    }
    loaderDismissTimeoutId = setTimeout(function(){
      if(bootLoaderHidden){
        loaderDismissTimeoutId = 0;
        return;
      }
      forceStartupFromLoader();
      if(!bootLoaderHidden) {
        hideLoader();
      }
      loaderDismissTimeoutId = 0;
    }, 4000);
    attemptLoaderDismiss();
  }

  function attemptLoaderDismiss(){
    if(bootLoaderHidden) return;
    if(!loaderProgressDone || !userReadyToDismissLoader) return;
    if(!loaderDismissForcedByClick && !(loaderHideReady || bootCanHideLoader)) return;

    if(!loaderDismissForcedByClick && !isStartupSurfaceReadyToReveal()){
      loaderHideRetries += 1;
      if(shouldForceHideLoader() || loaderHideRetries > 24){
        forceStartupFromLoader();
        hideLoader();
        return;
      }
      if(loaderHideRetries <= 24){
        setTimeout(attemptLoaderDismiss, 120);
        return;
      }
    }

    hideLoader();
  }

  window.__ddLoaderRecovery = forceLoaderInteractionRecovery;
  window.__ddPlayBootSound = playBootSound;
  window.__ddRequestLoaderHide = markLoaderHideRequest;
  window.__ddRunStartupRecovery = runStartupRecoveryPass;
  window.__ddResetLoaderDismiss = requestLoaderDismiss;
  window.__ddWasLoaderTriggered = function(){ return loaderHideTriggered; };
  window.__ddLoaderDismissed = false;
  if(loaderWrap){
    var onLoaderInteract = function(){
      window.__ddLoaderDismissed = true;
      requestLoaderDismiss();
    };
    loaderWrap.addEventListener('click', onLoaderInteract, true);
    loaderWrap.addEventListener('pointerdown', onLoaderInteract, true);
    loaderWrap.addEventListener('touchstart', onLoaderInteract, true);
  }

  runLoaderProgress();
  syncLoaderKobaTurn();
  playBootSound();

  window.addEventListener('load', function(){
    loaderHideReady = true;
    attemptLoaderDismiss();
  });

  setTimeout(function(){
    if(!bootLoaderHidden){
      markLoaderProgressDone();
    }
  }, 10000);
})();
