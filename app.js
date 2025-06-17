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

// --- (findOptimalBackCameraDeviceId, setupControls, setupZoomSlider, setupTorchButton 함수는 v0.6과 동일) ---
// (이전 코드 붙여넣기)
async function findOptimalBackCameraDeviceId() { /* v0.6과 동일 */ }
function setupControls() { /* v0.6과 동일 */ }
function setupZoomSlider() { /* v0.6과 동일 */ }
function setupTorchButton() { /* v0.6과 동일 */ }

// ✨ v0.8: 크롭 및 스캔을 수행하는 고효율 루프 함수
function startManualScanLoop(canvas, guide) {
  if (!isScanning) return;

  const videoRect = videoElement.getBoundingClientRect();
  const guideRect = guide.getBoundingClientRect();

  // 비디오 요소 내에서 가이드 박스의 상대적 위치 계산
  const cropX = (guideRect.left - videoRect.left) / videoRect.width * videoElement.videoWidth;
  const cropY = (guideRect.top - videoRect.top) / videoRect.height * videoElement.videoHeight;
  const cropWidth = guideRect.width / videoRect.width * videoElement.videoWidth;
  const cropHeight = guideRect.height / videoRect.height * videoElement.videoHeight;

  // 캔버스 크기를 크롭할 영역의 크기로 설정
  canvas.width = cropWidth;
  canvas.height = cropHeight;

  const ctx = canvas.getContext('2d');
  // 비디오의 중앙 영역(가이드 박스)만 잘라내서 캔버스에 그립니다.
  ctx.drawImage(videoElement, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  try {
    const result = codeReader.decodeFromCanvas(ctx);
    if (result && result.getText()) {
      output.textContent = `✅ 바코드: ${result.getText()}`;
      navigator.clipboard.writeText(result.getText()).catch(e => console.error('클립보드 복사 실패:', e));
      stopScan();
      return;
    }
  } catch (err) {
    if (!(err instanceof ZXing.NotFoundException)) {
      console.error('스캔 오류:', err);
    }
  }

  animationFrameId = requestAnimationFrame(() => startManualScanLoop(canvas, guide));
}

// ✨ v0.8: 안정성이 강화된 스캔 중지 함수
function stopScan() {
  isScanning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (codeReader) codeReader.reset();
  if (videoStream) videoStream.getTracks().forEach(track => track.stop());

  videoContainer.style.display = 'none';
  controlsContainer.style.display = 'none';
  scanButton.textContent = '스캔 다시 시작';
  scanButton.classList.remove('is-scanning');

  isTorchOn = false;
  torchButton.textContent = '🔦 토치 켜기';
  torchButton.classList.remove('is-on');

  videoTrack = null;
}

// ✨ v0.8: 안정성과 효율성이 개선된 스캔 시작 로직
scanButton.addEventListener('click', async () => {
  if (isScanning) {
    stopScan();
    return;
  }

  scanCount++;
  scanCountElem.textContent = `스캔 시도: ${scanCount}회`;
  scanButton.textContent = '스캔 중지';
  scanButton.classList.add('is-scanning');
  output.textContent = '카메라 준비 중...';
  videoContainer.style.display = 'block';

  try {
    const selectedDeviceId = await findOptimalBackCameraDeviceId();

    const constraints = {
      video: {
        deviceId: { exact: selectedDeviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // 초점 모드는 고급 제약으로 넣어 실패하더라도 전체가 중단되지 않도록 함
        advanced: [{ focusMode: 'continuous' }]
      }
    };

    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = videoStream;

    // play()는 비디오가 재생 준비되면 resolve되는 Promise를 반환. 이게 훨씬 안정적임.
    await videoElement.play();

    videoTrack = videoStream.getVideoTracks()[0];
    setupControls(); // 줌/토치 컨트롤러 설정

    codeReader = new ZXing.BrowserMultiFormatReader();
    isScanning = true;
    output.textContent = '바코드를 빨간색 상자 안에 위치시켜 주세요.';

    // 캔버스와 가이드 요소를 한 번만 생성/가져와서 루프에 전달 (성능 최적화)
    const canvas = document.createElement('canvas');
    const scanGuide = document.querySelector('.scan-guide');
    startManualScanLoop(canvas, scanGuide);

  } catch (err) {
    console.error('스캔 시작 중 에러 발생:', err);
    output.textContent = err.name === 'NotAllowedError' ? '❌ 카메라 권한이 필요합니다.' : `❌ 에러: ${err.message}`;
    stopScan();
  }
});