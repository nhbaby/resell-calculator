const scanButton = document.getElementById('scanButton');
const videoElement = document.getElementById('video');
const output = document.getElementById('output');
const scanCountElem = document.getElementById('scanCount');
const zoomSlider = document.getElementById('zoomSlider');
const zoomLabel = document.getElementById('zoomLabel');
const zoomValueDisplay = document.getElementById('zoomValue');

let isScanning = false;
let codeReader = null;
let videoStream = null;
let scanCount = 0;
let videoTrack = null;  // 비디오 트랙 저장

// 후면 카메라 deviceId 탐색 함수
async function getBackCameraDeviceId() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');
  const backCamera = videoDevices.find(device =>
    device.label.toLowerCase().includes('back') ||
    device.label.toLowerCase().includes('rear')
  );
  return backCamera ? backCamera.deviceId : (videoDevices[0] && videoDevices[0].deviceId);
}

// 줌 슬라이더 활성화 함수
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
    zoomLabel.style.display = 'none';
  }
}

// 스캔 버튼 클릭 이벤트
scanButton.addEventListener('click', async () => {
  if (!isScanning) {
    scanCount++;
    scanCountElem.textContent = `스캔 시도: ${scanCount}회`;
    scanButton.textContent = '스캔 중...';
    output.textContent = '';
    videoElement.style.display = 'block';

    try {
      codeReader = new ZXing.BrowserMultiFormatReader();

      const selectedDeviceId = await getBackCameraDeviceId();

      if (!selectedDeviceId) {
        output.textContent = '❌ 사용 가능한 카메라가 없습니다!';
        scanButton.textContent = '스캔 시작';
        videoElement.style.display = 'none';
        return;
      }

      videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedDeviceId,
          aspectRatio: 1.33
        }
      });

      videoElement.srcObject = videoStream;
      await videoElement.play();

      videoTrack = videoStream.getVideoTracks()[0];
      setupZoomSlider();  // 카메라 줌 지원 여부에 따라 슬라이더 표시

      codeReader.decodeFromVideoDevice(selectedDeviceId, videoElement, (result, err) => {
        if (result) {
          output.textContent = `✅ 바코드: ${result.text}`;

          navigator.clipboard.writeText(result.text).then(() => {
            console.log('클립보드 복사 성공!');
          }).catch(err => {
            console.error('클립보드 복사 실패:', err);
          });

          stopScan();
        }
        if (err && !(err instanceof ZXing.NotFoundException)) {
          console.error('스캔 오류:', err);
        }
      });

      isScanning = true;
    } catch (err) {
      console.error('에러 발생:', err);
      output.textContent = '에러 발생: ' + err;
      scanButton.textContent = '스캔 시작';
      videoElement.style.display = 'none';
    }
  } else {
    stopScan();
  }
});

function stopScan() {
  if (codeReader) {
    codeReader.reset();
  }
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
  }
  videoElement.style.display = 'none';
  scanButton.textContent = '스캔 다시 시작';
  zoomLabel.style.display = 'none';
  isScanning = false;
  videoTrack = null;
}
