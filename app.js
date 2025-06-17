const scanButton = document.getElementById('scanButton');
const videoContainer = document.getElementById('videoContainer');
const videoElement = document.getElementById('video');
const focusBox = document.getElementById('focusBox');
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
let codeReader = null;
let videoStream = null;
let videoTrack = null;
let scanCount = 0;
let isTorchOn = false;
let animationFrameId = null;
let currentDeviceId = null;

function logToScreen(message) {
  if (debugLog) {
    debugLog.innerHTML += `> ${message}\n`;
    debugLog.scrollTop = debugLog.scrollHeight;
  }
}

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
        torchButton.parentElement.style.display = 'block';
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

/**
 * v1.8: '탭하여 초점 맞추기' 이벤트 핸들러 설정
 */
function setupTapToFocus() {
    videoContainer.addEventListener('click', (event) => {
        if (!videoTrack) return;

        const capabilities = videoTrack.getCapabilities();
        // 초점 거리(focusDistance) 또는 포인트 포커스(pointsOfInterest)를 지원하는지 확인
        if (!capabilities.focusDistance && !capabilities.pointsOfInterest) {
            logToScreen("이 카메라는 탭 포커스를 지원하지 않습니다.");
            return;
        }

        const rect = videoContainer.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // 초점 UI 표시 및 애니메이션
        focusBox.style.left = `${x}px`;
        focusBox.style.top = `${y}px`;
        focusBox.classList.remove('is-focusing');
        void focusBox.offsetWidth; // 리플로우 강제
        focusBox.classList.add('is-focusing');

        const focusPoint = { x: x / rect.width, y: y / rect.height };
        const constraints = { advanced: [{ pointsOfInterest: [focusPoint], focusMode: 'continuous' }] };

        logToScreen(`탭 포커스 시도: x=${focusPoint.x.toFixed(2)}, y=${focusPoint.y.toFixed(2)}`);

        videoTrack.applyConstraints(constraints)
            .catch(e => logToScreen(`포커스 조절 실패: ${e}`));
    });
}

/**
 * v1.8: 화면 전체를 스캔하는 단순화된 스캔 루프
 */
function startManualScanLoop() {
  if (!isScanning || !codeReader) return;

  try {
    const result = codeReader.decodeOnce(videoElement);
    if (result && result.text) {
      output.textContent = `✅ 바코드: ${result.text}`;
      navigator.clipboard.writeText(result.text).catch(e => logToScreen(`클립보드 복사 실패: ${e}`));
      stopScan();
      return;
    }
  } catch (err) {
    if (!(err instanceof ZXing.NotFoundException)) {
      logToScreen(`스캔 오류: ${err}`);
    }
  }

  animationFrameId = requestAnimationFrame(startManualScanLoop);
}

function stopScan(resetUI = true) {
  isScanning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
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

async function startScanWithDevice(deviceId) {
  stopScan(false);
  isScanning = true;
  output.textContent = '카메라 전환 중...';

  const constraints = {
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      focusMode: 'continuous'
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
            setupTapToFocus(); // 탭 포커스 기능 활성화

            output.textContent = '바코드를 중앙에 두고, 필요하면 탭하여 초점을 맞추세요.';

            const hints = new Map();
            const formats = [
                ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.CODE_128,
                ZXing.BarcodeFormat.QR_CODE, ZXing.BarcodeFormat.DATA_MATRIX
            ];
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

            codeReader = new ZXing.BrowserMultiFormatReader(hints);

            startManualScanLoop();

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

cameraSelect.addEventListener('change', (event) => {
  const selectedDeviceId = event.target.value;
  if (selectedDeviceId !== currentDeviceId) {
    logToScreen(`사용자가 카메라 변경 요청: ${selectedDeviceId}`);
    startScanWithDevice(selectedDeviceId);
  }
});