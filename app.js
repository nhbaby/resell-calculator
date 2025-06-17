const scanButton = document.getElementById('scanButton');
const videoContainer = document.getElementById('videoContainer');
const videoElement = document.getElementById('video');
const output = document.getElementById('output');
const scanCountElem = document.getElementById('scanCount');
const zoomSlider = document.getElementById('zoomSlider');
const zoomLabel = document.getElementById('zoomLabel');
const zoomValueDisplay = document.getElementById('zoomValue');

let isScanning = false;
let codeReader = null;
let videoStream = null;
let videoTrack = null;
let scanCount = 0;

/**
 * 사용 가능한 비디오 입력 장치 중 최적의 후면 카메라를 찾습니다.
 * 1순위: 망원(Telephoto) 카메라
 * 2순위: 광각(Wide)이 아닌 후면 카메라 (표준 카메라일 확률 높음)
 * 3순위: 첫 번째 후면 카메라
 * 4순위: 첫 번째 비디오 장치
 * @returns {string|undefined} 최적의 카메라 deviceId
 */
async function findOptimalBackCameraDeviceId() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');

  if (videoDevices.length === 0) {
    console.warn("사용 가능한 비디오 장치가 없습니다.");
    return undefined;
  }

  const backCameras = videoDevices.filter(device =>
    device.label.toLowerCase().includes('back') ||
    device.label.toLowerCase().includes('rear')
  );

  if (backCameras.length > 0) {
    // 후면 카메라가 여러 개일 경우, 렌즈 종류에 따라 우선순위 부여
    if (backCameras.length > 1) {
      const telephotoCamera = backCameras.find(cam => cam.label.toLowerCase().includes('telephoto'));
      if (telephotoCamera) {
        console.log('망원 카메라 선택:', telephotoCamera.label);
        return telephotoCamera.deviceId;
      }

      const standardCamera = backCameras.find(cam => !cam.label.toLowerCase().includes('wide'));
      if (standardCamera) {
        console.log('표준 카메라 선택:', standardCamera.label);
        return standardCamera.deviceId;
      }
    }
    // 적절한 카메라를 못 찾았거나 후면 카메라가 1개 뿐이면, 첫 번째 후면 카메라 사용
    console.log('기본 후면 카메라 선택:', backCameras[0].label);
    return backCameras[0].deviceId;
  }

  // 후면 카메라가 없으면, 그냥 첫 번째 비디오 장치를 반환
  console.log('첫 번째 비디오 장치 선택:', videoDevices[0].label);
  return videoDevices[0].deviceId;
}

/**
 * 줌 슬라이더를 설정하고, 카메라가 줌을 지원하는 경우에만 표시합니다.
 */
function setupZoomSlider() {
  if (!videoTrack) {
    zoomLabel.style.display = 'none';
    return;
  }
  const capabilities = videoTrack.getCapabilities();
  if (capabilities.zoom) {
    zoomSlider.min = capabilities.zoom.min || 1;
    zoomSlider.max = capabilities.zoom.max || 5; // 최대 줌 값을 조금 더 넉넉하게
    zoomSlider.step = capabilities.zoom.step || 0.1;

    const currentZoom = videoTrack.getSettings().zoom || zoomSlider.min;
    zoomSlider.value = currentZoom;
    zoomValueDisplay.textContent = Number(currentZoom).toFixed(1);

    zoomLabel.style.display = 'inline-block';

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
    console.log("이 카메라는 줌을 지원하지 않습니다.");
    zoomLabel.style.display = 'none';
  }
}

/**
 * 스캔 프로세스를 중지하고 모든 리소스를 해제합니다.
 */
function stopScan() {
  isScanning = false;
  if (codeReader) {
    codeReader.reset();
  }
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
  }
  videoContainer.style.display = 'none';
  scanButton.textContent = '스캔 다시 시작';
  scanButton.classList.remove('is-scanning');
  zoomLabel.style.display = 'none';
  videoTrack = null;
}

scanButton.addEventListener('click', async () => {
  if (!isScanning) {
    // --- 스캔 시작 로직 ---
    scanCount++;
    scanCountElem.textContent = `스캔 시도: ${scanCount}회`;
    scanButton.textContent = '스캔 중지';
    scanButton.classList.add('is-scanning');
    output.textContent = '';
    videoContainer.style.display = 'block';

    try {
      const selectedDeviceId = await findOptimalBackCameraDeviceId();
      if (!selectedDeviceId) {
        throw new Error('사용 가능한 카메라가 없습니다!');
      }

      const initialZoom = 2.0; // 광학 줌 유도를 위한 초기 줌 값
      const constraints = {
        video: {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // 고급 제약: 초기 줌 레벨을 요청하여 망원 렌즈 활성화를 유도
          advanced: [{ zoom: initialZoom }]
        }
      };

      try {
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log(`초기 줌(${initialZoom}x) 설정으로 카메라 시작 성공.`);
      } catch (e) {
        console.warn(`초기 줌 설정 실패(${e.name}). 기본 설정으로 다시 시도합니다.`);
        delete constraints.video.advanced; // 줌 제약 제거
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      videoElement.srcObject = videoStream;
      await videoElement.play();

      videoTrack = videoStream.getVideoTracks()[0];
      setupZoomSlider(); // 줌 슬라이더 설정

      codeReader = new ZXing.BrowserMultiFormatReader();
      codeReader.decodeFromVideoDevice(selectedDeviceId, videoElement, (result, err) => {
        if (result) {
          output.textContent = `✅ 바코드: ${result.text}`;
          navigator.clipboard.writeText(result.text)
            .then(() => console.log('클립보드 복사 성공!'))
            .catch(err => console.error('클립보드 복사 실패:', err));

          stopScan();
        }
        if (err && !(err instanceof ZXing.NotFoundException)) {
          console.error('스캔 오류:', err);
        }
      });

      isScanning = true;

    } catch (err) {
      console.error('스캔 시작 중 에러 발생:', err);
      if (err.name === 'NotAllowedError') {
        output.textContent = '❌ 카메라 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.';
      } else {
        output.textContent = `❌ 에러: ${err.message}`;
      }
      stopScan(); // 에러 발생 시에도 리소스 정리
    }

  } else {
    // --- 스캔 중지 로직 ---
    stopScan();
  }
});