// --- (기존 변수 선언은 동일) ---
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

let isScanning = false;
let codeReader = null;
let videoStream = null;
let videoTrack = null;
let scanCount = 0;
let isTorchOn = false;
let animationFrameId = null;

// --- (findOptimalBackCameraDeviceId, setupControls 등 보조 함수는 v0.8과 거의 동일) ---
async function findOptimalBackCameraDeviceId() { /* v0.8과 동일 */ }
function setupControls() { /* v0.8과 동일 */ }
function setupZoomSlider() { /* v0.8과 동일 */ }
function setupTorchButton() { /* v0.8과 동일 */ }
function startManualScanLoop(canvas, guide) { /* v0.8과 동일 */ }


// ✨ v0.9: 안정성이 대폭 강화된 스캔 중지 함수
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

  // 비디오 요소 완전 초기화
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


// ✨ v0.9: 이벤트 기반으로 수정된 안정적인 스캔 시작 로직
scanButton.addEventListener('click', async () => {
  if (isScanning) {
    stopScan();
    return;
  }

  scanCount++;
  scanCountElem.textContent = `스캔 시도: ${scanCount}회`;
  scanButton.textContent = '스캔 중지';
  scanButton.classList.add('is-scanning');
  output.textContent = '카메라 권한 요청 중...';

  try {
    const selectedDeviceId = await findOptimalBackCameraDeviceId();
    const constraints = {
      video: {
        deviceId: { exact: selectedDeviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }]
      }
    };

    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = videoStream;
    videoContainer.style.display = 'block';

    // ✨ v0.9 핵심 수정: await play() 대신 'canplay' 이벤트를 사용
    // 비디오가 실제로 재생 가능한 상태가 되면 스캔 로직을 시작합니다.
    const startScanningProcess = () => {
      output.textContent = '바코드를 빨간색 상자 안에 위치시켜 주세요.';

      videoTrack = videoStream.getVideoTracks()[0];
      setupControls();

      codeReader = new ZXing.BrowserMultiFormatReader();
      isScanning = true;

      const canvas = document.createElement('canvas');
      const scanGuide = document.querySelector('.scan-guide');
      startManualScanLoop(canvas, scanGuide);
    };

    // 'canplay' 이벤트 리스너를 추가합니다. { once: true } 옵션으로 한번만 실행되도록 보장합니다.
    videoElement.addEventListener('canplay', startScanningProcess, { once: true });

    // play()를 호출하여 재생을 '시작'만 시킵니다. 완료를 기다리지 않습니다.
    videoElement.play().catch(err => {
        // play() 자체가 에러를 발생시키는 경우(예: 사용자가 상호작용하기 전에 호출)
        console.error("비디오 재생 실패:", err);
        output.textContent = `❌ 비디오 재생에 실패했습니다: ${err.message}`;
        stopScan();
    });

  } catch (err) {
    console.error('스캔 시작 중 에러 발생:', err);
    output.textContent = err.name === 'NotAllowedError' ? '❌ 카메라 권한이 필요합니다.' : `❌ 에러: ${err.message}`;
    stopScan();
  }
});