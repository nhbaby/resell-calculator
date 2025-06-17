const scanButton = document.getElementById('scanButton');
const videoContainer = document.getElementById('videoContainer');
const videoElement = document.getElementById('video');
const output = document.getElementById('output');
const scanCountElem = document.getElementById('scanCount');
const controlsContainer = document.getElementById('controlsContainer');
const zoomControl = document.getElementById('zoomControl');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValueDisplay = document.getElementById('zoomValue');
const torchButton = document.getElementById('torchButton');
const cameraSelect = document.getElementById('cameraSelect');
const debugLog = document.getElementById('debugLog');

let isScanning = false;
let codeReader = null; // ✨ 이 변수를 초기화하는 것이 핵심!
let videoStream = null;
let videoTrack = null;
let scanCount = 0;
let isTorchOn = false;
let animationFrameId = null;
let currentDeviceId = null;

// --- (logToScreen, findOptimalBackCameraId, populateCameraSelector 등 보조 함수는 v1.3과 동일) ---
function logToScreen(message) {
  if (debugLog) {
    debugLog.innerHTML += `> ${message}\n`;
    debugLog.scrollTop = debugLog.scrollHeight;
  }
}
function findOptimalBackCameraId(videoDevices) { /* v1.3과 동일 */ }
function populateCameraSelector(devices, selectedDeviceId) { /* v1.3과 동일 */ }
function setupZoomSlider() { /* v1.3과 동일 */ }
function setupTorchButton() { /* v1.3과 동일 */ }
function startManualScanLoop(canvas, guide) { /* v1.3과 동일 */ }


/**
 * 스캔 프로세스를 중지하고 리소스를 해제합니다.
 * @param {boolean} resetUI - 버튼과 같은 UI 요소까지 완전히 리셋할지 여부
 */
function stopScan(resetUI = true) {
  isScanning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // ✨ v1.4: codeReader를 null로 설정하여 확실하게 정리
  if (codeReader) {
    codeReader.reset();
    codeReader = null;
  }

  if (videoStream) videoStream.getTracks().forEach(track => track.stop());

  videoElement.pause();
  videoElement.srcObject = null;
  videoTrack = null;
  currentDeviceId = null;

  if (resetUI) {
    videoContainer.style.display = 'none';
    controlsContainer.style.display = 'none';
    scanButton.textContent = '스캔 시작';
    scanButton.classList.remove('is-scanning');
    if (debugLog) debugLog.innerHTML = "";
  }
}


/**
 * 특정 deviceId로 스캔을 시작하거나 전환합니다.
 * @param {string} deviceId - 사용할 카메라의 deviceId
 */
async function startScanWithDevice(deviceId) {
  stopScan(false);

  isScanning = true;
  output.textContent = '카메라 전환 중...';

  const constraints = {
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }]
    }
  };

  try {
    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    currentDeviceId = deviceId;
    logToScreen(`스트림 전환 성공: ${videoStream.getVideoTracks()[0].label}`);

    videoElement.srcObject = videoStream;

    const onCanPlay = async () => {
        try {
            await videoElement.play();
            videoTrack = videoStream.getVideoTracks()[0];
            setupZoomSlider();
            setupTorchButton();
            output.textContent = '바코드를 빨간색 상자 안에 위치시켜 주세요.';

            // ✨ v1.4 핵심 수정: codeReader를 여기서 초기화합니다!
            codeReader = new ZXing.BrowserMultiFormatReader();

            const canvas = document.createElement('canvas');
            const scanGuide = document.querySelector('.scan-guide');
            startManualScanLoop(canvas, scanGuide);
        } catch (playError) {
            logToScreen(`❌ 비디오 재생 실패: ${playError.message}`);
            stopScan();
        }
    };

    videoElement.addEventListener('canplay', onCanPlay, { once: true });

  } catch (err) {
    logToScreen(`❌ 카메라 전환 실패: ${err.message}`);
    output.textContent = `❌ 카메라 전환 실패: ${err.message}`;
    stopScan();
  }
}

/**
 * 메인 '스캔 시작' 버튼 클릭 이벤트 핸들러
 */
scanButton.addEventListener('click', async () => {
  if (isScanning) {
    stopScan();
    return;
  }

  if(debugLog) debugLog.innerHTML = "";
  scanCount++;
  scanCountElem.textContent = `스캔 시도: ${scanCount}회`;
  scanButton.textContent = '스캔 중지';
  scanButton.classList.add('is-scanning');
  output.textContent = '카메라 준비 중...';

  try {
    // ✨ v1.4: getUserMedia({ video: true }) 로 권한을 먼저 얻는 간결한 방식으로 변경
    const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    initialStream.getTracks().forEach(track => track.stop());

    const deviceLabels = devices.map((d, i) => `${i}: ${d.label}`).join('\n  ');
    logToScreen(`사용 가능 비디오 장치:\n  ${deviceLabels}`);

    const optimalDeviceId = findOptimalBackCameraId(devices);

    if (!optimalDeviceId) {
        throw new Error("사용 가능한 후면 카메라를 찾을 수 없습니다.");
    }

    populateCameraSelector(devices, optimalDeviceId);
    videoContainer.style.display = 'block';
    controlsContainer.style.display = 'flex';

    await startScanWithDevice(optimalDeviceId);

  } catch (err) {
    logToScreen(`❌ 스캔 시작 중 에러: ${err.message}`);
    output.textContent = `❌ 에러: ${err.message}`;
    stopScan();
  }
});

/**
 * 카메라 선택 드롭다운 메뉴 변경 이벤트 핸들러
 */
cameraSelect.addEventListener('change', (event) => {
  const selectedDeviceId = event.target.value;
  if (selectedDeviceId !== currentDeviceId) {
    logToScreen(`사용자가 카메라 변경 요청: ${selectedDeviceId}`);
    startScanWithDevice(selectedDeviceId);
  }
});

// 이전에 생략되었던 보조 함수들을 모두 포함합니다.
function findOptimalBackCameraId(videoDevices) {
  const backCameras = videoDevices.filter(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
  if (backCameras.length === 0) {
    logToScreen('⚠️ 후면 카메라를 찾지 못함.');
    return videoDevices.length > 0 ? videoDevices[0].deviceId : null;
  }

  let telephoto = backCameras.find(d => d.label.toLowerCase().includes('telephoto'));
  if (telephoto) {
    logToScreen(`✅ 망원 카메라 선택: ${telephoto.label}`);
    return telephoto.deviceId;
  }

  for (let i = backCameras.length - 1; i >= 0; i--) {
    if (!backCameras[i].label.toLowerCase().includes('wide')) {
      logToScreen(`✅ 표준 추정 카메라 선택: ${backCameras[i].label}`);
      return backCameras[i].deviceId;
    }
  }

  logToScreen(`⚠️ 표준/망원 추정 실패. 첫 후면 카메라 선택: ${backCameras[0].label}`);
  return backCameras[0].deviceId;
}

function populateCameraSelector(devices, selectedDeviceId) {
  cameraSelect.innerHTML = '';
  devices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.innerText = device.label || `카메라 ${cameraSelect.options.length + 1}`;
    if (device.deviceId === selectedDeviceId) {
      option.selected = true;
    }
    cameraSelect.appendChild(option);
  });
}

function setupZoomSlider() {
    const capabilities = videoTrack.getCapabilities();
    if (capabilities.zoom) {
        zoomControl.style.display = 'flex';
        zoomSlider.min = capabilities.zoom.min || 1;
        zoomSlider.max = capabilities.zoom.max || 5;
        zoomSlider.step = capabilities.zoom.step || 0.1;
        zoomSlider.value = videoTrack.getSettings().zoom || 1;
        zoomValueDisplay.textContent = Number(zoomSlider.value).toFixed(1);

        zoomSlider.oninput = () => {
            videoTrack.applyConstraints({ advanced: [{ zoom: Number(zoomSlider.value) }] });
            zoomValueDisplay.textContent = Number(zoomSlider.value).toFixed(1);
        };
    } else {
        zoomControl.style.display = 'none';
    }
}

function setupTorchButton() {
    const capabilities = videoTrack.getCapabilities();
    if (capabilities.torch) {
        torchButton.parentElement.style.display = 'block'; // 부모 div를 보이게 함
        torchButton.style.display = 'block';
        torchButton.onclick = () => {
            isTorchOn = !isTorchOn;
            videoTrack.applyConstraints({ advanced: [{ torch: isTorchOn }] });
            torchButton.textContent = isTorchOn ? '🔦 토치 끄기' : '🔦 토치 켜기';
        };
    } else {
        torchButton.parentElement.style.display = 'none';
    }
}

function startManualScanLoop(canvas, guide) {
  if (!isScanning || !codeReader) return; // codeReader가 null이면 루프 중단

  const videoRect = videoElement.getBoundingClientRect();
  const guideRect = guide.getBoundingClientRect();

  if (videoRect.width === 0 || videoRect.height === 0) {
      // 비디오가 아직 렌더링되지 않았으면 다음 프레임에서 재시도
      animationFrameId = requestAnimationFrame(() => startManualScanLoop(canvas, guide));
      return;
  }

  const cropX = (guideRect.left - videoRect.left) / videoRect.width * videoElement.videoWidth;
  const cropY = (guideRect.top - videoRect.top) / videoRect.height * videoElement.videoHeight;
  const cropWidth = guideRect.width / videoRect.width * videoElement.videoWidth;
  const cropHeight = guideRect.height / videoRect.height * videoElement.videoHeight;

  canvas.width = cropWidth;
  canvas.height = cropHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  try {
    const result = codeReader.decodeFromCanvas(ctx);
    if (result && result.getText()) {
      output.textContent = `✅ 바코드: ${result.getText()}`;
      navigator.clipboard.writeText(result.getText()).catch(e => logToScreen(`클립보드 복사 실패: ${e}`));
      stopScan();
      return;
    }
  } catch (err) {
    if (!(err instanceof ZXing.NotFoundException)) {
      logToScreen(`스캔 오류: ${err}`);
    }
  }

  animationFrameId = requestAnimationFrame(() => startManualScanLoop(canvas, guide));
}