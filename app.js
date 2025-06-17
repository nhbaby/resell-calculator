// --- (기존 변수 선언은 동일) ---
const scanButton = document.getElementById('scanButton');
const videoContainer = document.getElementById('videoContainer');
const videoElement = document.getElementById('video');
const output = document.getElementById('output');
// ... (나머지 변수들)

let isScanning = false;
let codeReader = null;
let videoStream = null;
let videoTrack = null;
let scanCount = 0;
let isTorchOn = false;
let animationFrameId = null; // 수동 스캔 루프 제어를 위한 ID

// --- (findOptimalBackCameraDeviceId, setupControls, setupZoomSlider, setupTorchButton 함수는 v0.6과 동일) ---
// (이전 코드 붙여넣기)
async function findOptimalBackCameraDeviceId() { /* v0.6과 동일 */ }
function setupControls() { /* v0.6과 동일 */ }
function setupZoomSlider() { /* v0.6과 동일 */ }
function setupTorchButton() { /* v0.6과 동일 */ }


// ✨ 새로운 수동 스캔 루프 함수 ✨
function startManualScanLoop() {
  if (!isScanning) return;

  // 숨겨진 캔버스를 만들어 비디오 프레임을 그립니다.
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');

  // 비디오의 현재 프레임을 캔버스에 그립니다.
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  try {
    // 캔버스에서 바코드를 해독 시도합니다.
    const result = codeReader.decodeFromCanvas(canvas);
    if (result && result.getText()) {
      output.textContent = `✅ 바코드: ${result.getText()}`;
      navigator.clipboard.writeText(result.getText()).catch(e => console.error('클립보드 복사 실패:', e));
      stopScan(); // 성공 시 스캔 중지
      return; // 루프 종료
    }
  } catch (err) {
    if (!(err instanceof ZXing.NotFoundException)) {
      console.error('스캔 오류:', err);
    }
    // NotFoundException은 정상적인 상황이므로 무시하고 계속 진행합니다.
  }

  // 다음 프레임에서 다시 스캔을 시도합니다.
  animationFrameId = requestAnimationFrame(startManualScanLoop);
}

function stopScan() {
  isScanning = false;
  // 진행 중인 스캔 루프를 확실히 중지합니다.
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

// ✨ 스캔 버튼 클릭 이벤트 핸들러 (전면 수정) ✨
scanButton.addEventListener('click', async () => {
  if (!isScanning) {
    scanCount++;
    scanCountElem.textContent = `스캔 시도: ${scanCount}회`;
    scanButton.textContent = '스캔 중지';
    scanButton.classList.add('is-scanning');
    output.textContent = '카메라 준비 중...';
    videoContainer.style.display = 'block';

    try {
      const selectedDeviceId = await findOptimalBackCameraDeviceId();

      // ✨ 초점과 해상도 제약을 강화한 constraints ✨
      const constraints = {
        video: {
          deviceId: { exact: selectedDeviceId },
          width: { min: 1280, ideal: 1920 }, // 더 높은 해상도 요구
          height: { min: 720, ideal: 1080 },
          focusMode: 'continuous', // 지속적인 자동 초점 시도
        }
      };

      videoStream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = videoStream;

      // 비디오가 재생될 때까지 기다립니다.
      await new Promise((resolve) => {
        videoElement.onloadedmetadata = () => resolve();
      });
      await videoElement.play();

      videoTrack = videoStream.getVideoTracks()[0];
      setupControls();

      codeReader = new ZXing.BrowserMultiFormatReader();
      isScanning = true;
      output.textContent = '바코드를 중앙에 위치시켜주세요...';

      // ✨ 수동 스캔 루프 시작 ✨
      startManualScanLoop();

    } catch (err) {
      console.error('스캔 시작 중 에러 발생:', err);
      output.textContent = err.name === 'NotAllowedError' ? '❌ 카메라 권한이 필요합니다.' : `❌ 에러: ${err.message}`;
      stopScan();
    }
  } else {
    stopScan();
  }
});