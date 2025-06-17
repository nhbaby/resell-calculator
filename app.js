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
let codeReader = null;
let videoStream = null;
let videoTrack = null;
let scanCount = 0;
let isTorchOn = false;
let animationFrameId = null;
let currentDeviceId = null; // 현재 사용 중인 카메라 ID 저장

/**
 * 화면에 디버그 메시지를 출력하는 헬퍼 함수
 * @param {string} message - 출력할 메시지
 */
function logToScreen(message) {
  if (debugLog) {
    debugLog.innerHTML += `> ${message}\n`;
    debugLog.scrollTop = debugLog.scrollHeight;
  }
}

/**
 * v1.3: 후면 카메라를 "역순"으로 탐색하여 표준/망원을 우선 찾도록 로직 개선
 * @param {MediaDeviceInfo[]} videoDevices - 사용 가능한 비디오 장치 목록
 * @returns {string|null} - 찾은 최적의 카메라 deviceId 또는 null
 */
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

/**
 * 카메라 선택 드롭다운 메뉴를 기기 목록으로 채웁니다.
 * @param {MediaDeviceInfo[]} devices - 사용 가능한 비디오 장치 목록
 * @param {string} selectedDeviceId - 현재 선택된 장치의 ID
 */
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
        torchButton.style.display = 'block';
        torchButton.onclick = () => {
            isTorchOn = !isTorchOn;
            videoTrack.applyConstraints({ advanced: [{ torch: isTorchOn }] });
            torchButton.textContent = isTorchOn ? '🔦 토치 끄기' : '🔦 토치 켜기';
        };
    } else {
        torchButton.style.display = 'none';
    }
}

function startManualScanLoop(canvas, guide) {
  if (!isScanning) return;

  const videoRect = videoElement.getBoundingClientRect();
  const guideRect = guide.getBoundingClientRect();

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
  if (codeReader) codeReader.reset();
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
  stopScan(false); // UI는 남겨두고 기존 스트림과 스캔 루프를 정리

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
    const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    initialStream.getTracks().forEach(track => track.stop());

    const deviceLabels = devices.map((d, i) => `${i}: ${d.label}`).join('\n  ');
    logToScreen(`사용 가능 비디오 장치:\n  ${deviceLabels}`);

    const optimalDeviceId = findOptimalBackCameraId(devices);

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