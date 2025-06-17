const scanBtn = document.getElementById('scan-btn');
const video = document.getElementById('video');
const resultEl = document.getElementById('result');
const zoomLabel = document.getElementById('zoom-label');
const zoomSlider = document.getElementById('zoom-slider');
const zoomValueDisplay = document.getElementById('zoom-value');
const cameraLabel = document.getElementById('camera-label');

let codeReader = null;
let videoStream = null;
let videoTrack = null;
let scanning = false;
let scanCount = 0;

async function getRearCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');
  // 후면 카메라만 필터링: 라벨에 back, rear, 환경 포함 여부 (대소문자 무관)
  const rearCameras = videoDevices.filter(device => /back|rear|환경/i.test(device.label));
  return rearCameras.length ? rearCameras : videoDevices; // 없으면 전체 리턴
}

async function selectPreferredCamera() {
  const rearCameras = await getRearCameras();

  // 라벨에 tele, zoom, main 포함된 카메라 우선 선택
  let preferred = rearCameras.find(cam => /tele|zoom|main/i.test(cam.label));

  if (!preferred && rearCameras.length > 0) {
    preferred = rearCameras[0];
  }

  if (preferred) {
    cameraLabel.textContent = '카메라: ' + preferred.label;
    return preferred.deviceId;
  } else {
    cameraLabel.textContent = '카메라: 알 수 없음';
    return null;
  }
}

async function startScanner() {
  if (scanning) {
    stopScanner();
    return;
  }

  scanBtn.textContent = '스캔중...';
  scanBtn.classList.add('scanning');
  scanning = true;

  try {
    const deviceId = await selectPreferredCamera();

    if (!deviceId) {
      resultEl.textContent = '사용 가능한 카메라가 없습니다.';
      stopScanner();
      return;
    }

    videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: 1.33
      }
    });

    video.srcObject = videoStream;
    video.setAttribute('playsinline', true);
    await video.play();

    videoTrack = videoStream.getVideoTracks()[0];

    setupZoomSlider();

    codeReader = new ZXing.BrowserMultiFormatReader();

    codeReader.decodeFromVideoElement(video, (result, err) => {
      if (result) {
        scanCount++;
        resultEl.textContent = '스캔 결과: ' + result.text;
        navigator.clipboard.writeText(result.text);
        scanBtn.textContent = `스캔 시작 (${scanCount}회)`;
        stopScanner();
      }
    });
  } catch (err) {
    console.error(err);
    resultEl.textContent = '카메라 실행 오류: ' + err.message;
    stopScanner();
  }
}

function stopScanner() {
  scanning = false;
  scanBtn.classList.remove('scanning');
  scanBtn.textContent = `스캔 시작 (${scanCount}회)`;
  if (codeReader) {
    codeReader.reset();
    codeReader = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  video.srcObject = null;
  zoomLabel.style.display = 'none';
}

function setupZoomSlider() {
  if (!videoTrack) {
    zoomLabel.style.display = 'none';
    return;
  }
  const capabilities = videoTrack.getCapabilities();

  if (capabilities.zoom) {
    zoomSlider.min = capabilities.zoom.min || 1;
    zoomSlider.max = capabilities.zoom.max || 3;
    zoomSlider.step = capabilities.zoom.step || 0.1;
    zoomSlider.value = videoTrack.getSettings().zoom || zoomSlider.min;
    zoomValueDisplay.textContent = Number(zoomSlider.value).toFixed(1);
    zoomLabel.style.display = 'flex';

    zoomSlider.oninput = async () => {
      const zoomLevel = Number(zoomSlider.value);
      zoomValueDisplay.textContent = zoomLevel.toFixed(1);
      try {
        await videoTrack.applyConstraints({ advanced: [{ zoom: zoomLevel }] });
      } catch (e) {
        console.warn('줌 조절 실패:', e);
      }
    };
  } else {
    zoomLabel.style.display = 'none';
  }
}

scanBtn.addEventListener('click', startScanner);
