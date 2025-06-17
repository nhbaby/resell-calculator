const scanButton = document.getElementById('scanButton');
const videoContainer = document.getElementById('videoContainer');
const videoElement = document.getElementById('video');
const output = document.getElementById('output');
const scanCountElem = document.getElementById('scanCount');
const controlsContainer = document.getElementById('controlsContainer');
const zoomLabel = document.getElementById('zoomLabel');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValueDisplay = document.getElementById('zoomValue');
const torchButton = document.getElementById('torchButton');
const debugLog = document.getElementById('debugLog'); // 디버그 로그 요소

let isScanning = false;
let codeReader = null;
let videoStream = null;
let videoTrack = null;
let scanCount = 0;
let isTorchOn = false;
let animationFrameId = null;

/**
 * v1.2: 화면에 디버그 메시지를 출력하는 헬퍼 함수
 * @param {string} message - 출력할 메시지
 */
function logToScreen(message) {
  debugLog.innerHTML += `> ${message}\n`;
  debugLog.scrollTop = debugLog.scrollHeight; // 항상 마지막 로그가 보이도록 스크롤
}

/**
 * v1.2: 사용 가능한 비디오 장치 목록에서 최적의 후면 카메라 ID를 찾습니다.
 * @param {MediaDeviceInfo[]} videoDevices - enumerateDevices로 얻은 비디오 장치 목록
 * @returns {string|null} - 찾은 최적의 카메라 deviceId 또는 null
 */
function findOptimalBackCameraId(videoDevices) {
  let camera = videoDevices.find(d => d.label.toLowerCase().includes('telephoto'));
  if (camera) {
    logToScreen(`✅ 망원 카메라 선택: ${camera.label}`);
    return camera.deviceId;
  }
  camera = videoDevices.find(d =>
    (d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear')) &&
    !d.label.toLowerCase().includes('wide')
  );
  if (camera) {
    logToScreen(`✅ 표준 후면 카메라 선택: ${camera.label}`);
    return camera.deviceId;
  }
  camera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
  if(camera){
    logToScreen(`✅ 기본 후면 카메라 선택: ${camera.label}`);
    return camera.deviceId;
  }
  logToScreen('⚠️ 특정 후면 카메라를 찾지 못함.');
  return null;
}

/**
 * v1.2: 최적의 카메라를 찾아 비디오 스트림을 반환하는 핵심 함수
 * @returns {Promise<MediaStream>} - 최적의 카메라로 생성된 미디어 스트림
 */
async function getOptimalVideoStream() {
  logToScreen("1. 최적 비디오 스트림 찾기 시작...");

  const initialStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');

  const deviceLabels = videoDevices.map((d, i) => `${i}: ${d.label}`).join('\n  ');
  logToScreen(`2. 사용 가능 비디오 장치 목록:\n  ${deviceLabels}`);

  const optimalDeviceId = findOptimalBackCameraId(videoDevices);

  initialStream.getTracks().forEach(track => track.stop());

  const finalConstraints = {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }]
    }
  };

  if (optimalDeviceId) {
    logToScreen(`3. 최종 deviceId로 스트림 요청.`);
    finalConstraints.video.deviceId = { exact: optimalDeviceId };
  } else {
    logToScreen("3. 최적 카메라 못찾아 facingMode로 스트림 요청.");
    finalConstraints.video.facingMode = { exact: 'environment' };
  }

  return navigator.mediaDevices.getUserMedia(finalConstraints);
}

// --- (setupControls, startManualScanLoop 등 나머지 함수는 이전과 동일) ---
function setupControls() { /* 이전과 동일 */ }
function setupZoomSlider() { /* 이전과 동일 */ }
function setupTorchButton() { /* 이전과 동일 */ }
function startManualScanLoop(canvas, guide) { /* 이전과 동일 */ }

function stopScan() {
  isScanning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (codeReader) codeReader.reset();
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
  }
  videoElement.pause();
  videoElement.srcObject = null;
  videoContainer.style.display = 'none';
  controlsContainer.style.display = 'none';
  scanButton.textContent = '스캔 시작';
  scanButton.classList.remove('is-scanning');
  isTorchOn = false;
  torchButton.textContent = '🔦 토치 켜기';
  torchButton.classList.remove('is-on');
  videoTrack = null;
}

scanButton.addEventListener('click', async () => {
  if (isScanning) {
    stopScan();
    return;
  }
  // 디버그 로그 초기화
  debugLog.innerHTML = "";
  scanCount++;
  scanCountElem.textContent = `스캔 시도: ${scanCount}회`;
  scanButton.textContent = '스캔 중지';
  scanButton.classList.add('is-scanning');
  output.textContent = '카메라 준비 중...';

  try {
    videoStream = await getOptimalVideoStream();

    const finalTrackLabel = videoStream.getVideoTracks()[0].label;
    logToScreen(`4. 최종 스트림 성공. 트랙: ${finalTrackLabel}`);

    videoElement.srcObject = videoStream;
    videoContainer.style.display = 'block';

    const startScanningProcess = () => {
      logToScreen("5. 비디오 재생 준비 완료. 스캔 시작.");
      output.textContent = '바코드를 빨간색 상자 안에 위치시켜 주세요.';
      videoTrack = videoStream.getVideoTracks()[0];
      setupControls();
      codeReader = new ZXing.BrowserMultiFormatReader();
      isScanning = true;
      const canvas = document.createElement('canvas');
      const scanGuide = document.querySelector('.scan-guide');
      startManualScanLoop(canvas, scanGuide);
    };

    videoElement.addEventListener('canplay', startScanningProcess, { once: true });
    videoElement.play().catch(err => {
      logToScreen(`❌ 비디오 재생 실패: ${err.message}`);
      output.textContent = `❌ 비디오 재생에 실패했습니다: ${err.message}`;
      stopScan();
    });

  } catch (err) {
    logToScreen(`❌ 스캔 시작 중 에러: ${err.name} - ${err.message}`);
    output.textContent = err.name === 'NotAllowedError' ? '❌ 카메라 권한이 필요합니다.' : `❌ 에러: ${err.message}`;
    stopScan();
  }
});