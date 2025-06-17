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

/**
 * v1.0: 스트림 활성화 후, 상세 정보가 포함된 장치 목록에서 최적의 카메라를 찾는 함수
 * @returns {Promise<{deviceId: string}>} 최적 카메라의 deviceId를 담은 객체
 */
async function findOptimalBackCamera() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');

  if (videoDevices.length === 0) {
    throw new Error('사용 가능한 카메라가 없습니다.');
  }

  const backCameras = videoDevices.filter(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));

  if (backCameras.length > 0) {
    // 1순위: 망원(Telephoto) 카메라
    let camera = backCameras.find(c => c.label.toLowerCase().includes('telephoto'));
    if (camera) {
      console.log('망원 카메라 발견:', camera.label);
      return { deviceId: camera.deviceId };
    }
    // 2순위: 광각(Wide)이 아닌 후면 카메라
    camera = backCameras.find(c => !c.label.toLowerCase().includes('wide'));
    if (camera) {
      console.log('표준 후면 카메라 발견:', camera.label);
      return { deviceId: camera.deviceId };
    }
    // 3순위: 첫 번째 후면 카메라
    console.log('기본 후면 카메라 선택:', backCameras[0].label);
    return { deviceId: backCameras[0].deviceId };
  }

  // 후면 카메라를 못 찾으면, 그냥 첫 번째 비디오 장치를 사용 (실패 시나리오)
  console.warn('후면 카메라를 찾지 못했습니다. 첫 번째 카메라를 사용합니다.');
  return { deviceId: videoDevices[0].deviceId };
}

/**
 * 줌/토치 등 카메라 컨트롤러 UI를 설정합니다.
 */
function setupControls() {
  if (!videoTrack) {
    controlsContainer.style.display = 'none';
    return;
  }
  controlsContainer.style.display = 'flex';
  setupZoomSlider();
  setupTorchButton();
}

/**
 * 카메라가 줌을 지원하는 경우 줌 슬라이더를 활성화합니다.
 */
function setupZoomSlider() {
  const capabilities = videoTrack.getCapabilities();
  if (capabilities.zoom) {
    zoomLabel.style.display = 'inline-block';
    zoomSlider.min = capabilities.zoom.min || 1;
    zoomSlider.max = capabilities.zoom.max || 5;
    zoomSlider.step = capabilities.zoom.step || 0.1;
    const currentZoom = videoTrack.getSettings().zoom || 1;
    zoomSlider.value = currentZoom;
    zoomValueDisplay.textContent = Number(currentZoom).toFixed(1);

    zoomSlider.oninput = async () => {
      try {
        await videoTrack.applyConstraints({ advanced: [{ zoom: Number(zoomSlider.value) }] });
        zoomValueDisplay.textContent = Number(zoomSlider.value).toFixed(1);
      } catch (e) { console.warn('줌 조절 실패:', e); }
    };
  } else {
    zoomLabel.style.display = 'none';
  }
}

/**
 * 카메라가 토치(손전등)를 지원하는 경우 토치 버튼을 활성화합니다.
 */
function setupTorchButton() {
  const capabilities = videoTrack.getCapabilities();
  if (capabilities.torch) {
    torchButton.style.display = 'inline-block';
    torchButton.onclick = async () => {
      try {
        isTorchOn = !isTorchOn;
        await videoTrack.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        torchButton.textContent = isTorchOn ? '🔦 토치 끄기' : '🔦 토치 켜기';
        torchButton.classList.toggle('is-on', isTorchOn);
      } catch (e) {
        console.warn('토치 제어 실패:', e);
      }
    };
  } else {
    torchButton.style.display = 'none';
  }
}

/**
 * 중앙 영역만 잘라내어 스캔하는 고효율 수동 스캔 루프
 * @param {HTMLCanvasElement} canvas - 스캔에 사용할 캔버스 요소
 * @param {HTMLElement} guide - 화면의 스캔 가이드 요소
 */
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

/**
 * 스캔 프로세스를 중지하고 모든 관련 리소스를 안전하게 해제합니다.
 */
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

/**
 * '스캔 시작' 버튼 클릭 시 실행되는 메인 로직
 */
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
    // 1단계: 먼저 '후면 카메라'를 선호한다는 힌트만으로 스트림을 얻어 권한을 활성화합니다.
    let initialStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });

    // 2단계: 스트림이 활성화되었으니, 이제 상세 정보가 담긴 카메라 목록을 얻을 수 있습니다.
    const optimalCamera = await findOptimalBackCamera();

    // 이전에 얻은 스트림은 닫아줍니다. (자원 낭비 방지)
    initialStream.getTracks().forEach(track => track.stop());

    // 3단계: 찾아낸 최적의 카메라 ID로 최종 스트림을 요청합니다.
    const finalConstraints = {
      video: {
        deviceId: { exact: optimalCamera.deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }]
      }
    };
    videoStream = await navigator.mediaDevices.getUserMedia(finalConstraints);

    videoElement.srcObject = videoStream;
    videoContainer.style.display = 'block';

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

    videoElement.addEventListener('canplay', startScanningProcess, { once: true });
    videoElement.play().catch(err => {
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