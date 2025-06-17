const scanButton = document.getElementById('scanButton');
const videoElement = document.getElementById('video');
const output = document.getElementById('output');
const scanCountElem = document.getElementById('scanCount');

let isScanning = false;
let codeReader = null;
let videoStream = null;
let scanCount = 0;

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
          zoom: true,
          aspectRatio: 1.33,
        }
      });

      videoElement.srcObject = videoStream;
      await videoElement.play();

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
  isScanning = false;
}
