// script.js
// Clean implementation using official tmPose APIs (no global shims or modifications)
const MODEL_PATH = "./"; // 모델 파일이 저장소 최상위에 있으므로 상대경로로 지정
let model = null;
let metadata = null;
let classLabels = [];
let maxPredictions = 0;

// DOM
const statusEl = document.getElementById("status");
const modelInfoEl = document.getElementById("modelInfo");

// 파일 업로드 관련
const fileInput = document.getElementById("fileInput");
const filePreview = document.getElementById("filePreview");
const analyzeFileBtn = document.getElementById("analyzeFileBtn");
const resultFile = document.getElementById("resultFile");

// 웹캠 관련
const startCamBtn = document.getElementById("startCamBtn");
const stopCamBtn = document.getElementById("stopCamBtn");
const captureBtn = document.getElementById("captureBtn");
const retakeBtn = document.getElementById("retakeBtn");
const analyzeCaptureBtn = document.getElementById("analyzeCaptureBtn");

const video = document.getElementById("video");
const captureCanvas = document.getElementById("captureCanvas");
const capturePreview = document.getElementById("capturePreview");
const resultCapture = document.getElementById("resultCapture");

let stream = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#d94b4b" : "#666";
}

function setButtonDisabled(button, disabled) {
  if (button) button.disabled = disabled;
}

function clearResult(el) {
  el.innerHTML = "";
}

function isCorrectPredictionClass(className = "") {
  const normalized = className.toLowerCase();
  return /올바른|correct|good|정상|right/.test(normalized);
}

async function waitForImageLoad(imageElement) {
  return new Promise((resolve, reject) => {
    if (!imageElement) return reject(new Error("이미지 요소가 없습니다."));
    if (imageElement.complete && imageElement.naturalWidth > 0) return resolve(imageElement);
    imageElement.onload = () => resolve(imageElement);
    imageElement.onerror = () => reject(new Error("이미지 로드에 실패했습니다."));
  });
}

async function waitForVideoReady(videoEl, timeout = 2000) {
  const start = Date.now();
  while ((videoEl.videoWidth === 0 || videoEl.videoHeight === 0) && (Date.now() - start) < timeout) {
    await new Promise(r => setTimeout(r, 100));
  }
  return videoEl.videoWidth > 0 && videoEl.videoHeight > 0;
}

async function initModel() {
  try {
    setStatus("모델을 로드하는 중입니다...");
    const modelURL = MODEL_PATH + "model.json";
    const metadataURL = MODEL_PATH + "metadata.json";

    model = await tmPose.load(modelURL, metadataURL);
    const resp = await fetch(metadataURL);
    metadata = await resp.json();
    classLabels = metadata.labels || metadata.class_names || [];
    maxPredictions = model.getTotalClasses ? model.getTotalClasses() : (classLabels.length || 0);

    setStatus("모델 로드 완료");
    // Remove modelInfo from user-facing area per requirement; keep small console info
    console.log('모델 정보:', { modelName: metadata.modelName || null, classes: classLabels });
  } catch (err) {
    console.error('모델 로드 실패:', err);
    setStatus('모델 로드 실패: model.json/metadata.json을 확인하세요.', true);
  }
}

async function analyzeImageElement(imgEl, resultContainer) {
  clearResult(resultContainer);
  if (!model) {
    resultContainer.textContent = '모델이 준비되지 않았습니다.';
    return;
  }

  try {
    setStatus('이미지에서 포즈를 추정하고 있습니다...');
    const loaded = await waitForImageLoad(imgEl);
    console.log('분석 시작 이미지 정보', { width: loaded.naturalWidth, height: loaded.naturalHeight, src: (loaded.src || '').slice(0,80) });

    // estimate pose using the official API
    const { pose, posenetOutput } = await model.estimatePose(loaded, false);
    console.log('포즈 추정 결과:', pose);

    const predictions = await model.predict(posenetOutput);
    console.log('모델 예측 결과:', predictions);

    if (!Array.isArray(predictions) || predictions.length === 0) {
      throw new Error('모델이 예측 결과를 반환하지 않았습니다.');
    }

    const sorted = predictions.slice().sort((a,b) => b.probability - a.probability);
    const top = sorted[0];

    // UI display per requirement
    const topLine = document.createElement('div');
    topLine.className = `top ${isCorrectPredictionClass(top.className) ? 'good' : 'bad'}`;
    topLine.textContent = isCorrectPredictionClass(top.className) ? '올바른 스쿼트입니다.' : '잘못된 스쿼트입니다.';

    const probLine = document.createElement('div');
    probLine.textContent = `예측 확률: ${(top.probability * 100).toFixed(1)}%`;

    const ul = document.createElement('ul');
    ul.className = 'prob-list';
    sorted.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${p.className}</span><strong>${(p.probability*100).toFixed(1)}%</strong>`;
      ul.appendChild(li);
    });

    resultContainer.appendChild(topLine);
    resultContainer.appendChild(probLine);
    resultContainer.appendChild(ul);

    if (!isCorrectPredictionClass(top.className)) {
      const correction = document.createElement('div');
      correction.className = 'correction-box';
      correction.innerHTML = `
        <h4>올바른 스쿼트 자세 조건</h4>
        <ul>
          <li>발끝보다 무릎이 과하게 앞으로 나가지 않도록 합니다.</li>
          <li>척추를 중립으로 유지하고 허리가 굽지 않도록 합니다.</li>
          <li>무릎이 안쪽으로 모이지 않도록 합니다.</li>
        </ul>
      `;
      resultContainer.appendChild(correction);
    }

    setStatus('분석 완료');
  } catch (err) {
    console.error('이미지 분석 실패:', err);
    resultContainer.textContent = '사진 분석 중 오류가 발생했습니다. 다른 사진으로 시도해 주세요.';
    setStatus('분석 실패. 콘솔을 확인하세요.', true);
  }
}

/* 파일 업로드 흐름 */
fileInput.addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) { filePreview.src = ''; setButtonDisabled(analyzeFileBtn, true); clearResult(resultFile); return; }
  const url = URL.createObjectURL(f);
  filePreview.src = url;
  filePreview.style.display = 'block';
  setButtonDisabled(analyzeFileBtn, false);
  clearResult(resultFile);
  console.log('업로드 이미지 선택됨', { fileName: f.name, size: f.size });
});

analyzeFileBtn.addEventListener('click', async () => {
  if (!filePreview.src) { resultFile.textContent = '분석할 사진을 업로드 해 주세요.'; return; }
  await analyzeImageElement(filePreview, resultFile);
});

/* 웹캠 흐름 */
startCamBtn.addEventListener('click', async () => {
  try {
    setStatus('카메라 권한 요청 중...');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    // wait for video to be ready
    const ready = await waitForVideoReady(video, 2000);
    if (!ready) {
      setStatus('카메라 초기화에 실패했습니다.', true);
      return;
    }
    setButtonDisabled(startCamBtn, true);
    setButtonDisabled(stopCamBtn, false);
    setButtonDisabled(captureBtn, false);
    setStatus('카메라 준비됨. 촬영 버튼을 눌러 정지 사진을 캡처하세요.');
  } catch (err) {
    console.error('카메라 시작 실패:', err);
    setStatus(err.name === 'NotAllowedError' ? '카메라 권한이 거부되었습니다.' : '카메라를 시작할 수 없습니다.', true);
  }
});

captureBtn.addEventListener('click', async () => {
  if (!stream) { resultCapture.textContent = '카메라가 실행 중이 아닙니다.'; return; }
  const ready = await waitForVideoReady(video, 2000);
  if (!ready) { resultCapture.textContent = '촬영에 실패했습니다. 잠시 후 다시 시도하세요.'; return; }
  try {
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    const dataUrl = captureCanvas.toDataURL('image/png');
    capturePreview.src = dataUrl;
    capturePreview.style.display = 'block';
    setButtonDisabled(analyzeCaptureBtn, false);
    setButtonDisabled(retakeBtn, false);
    clearResult(resultCapture);
    console.log('캡처 완료', { width: captureCanvas.width, height: captureCanvas.height });
  } catch (err) {
    console.error('캡처 실패:', err);
    resultCapture.textContent = '촬영 중 오류가 발생했습니다.';
  }
});

retakeBtn.addEventListener('click', () => {
  capturePreview.src = '';
  capturePreview.style.display = 'none';
  setButtonDisabled(analyzeCaptureBtn, true);
  setButtonDisabled(retakeBtn, true);
  clearResult(resultCapture);
  setStatus('다시 촬영할 준비가 되었습니다.');
});

analyzeCaptureBtn.addEventListener('click', async () => {
  if (!capturePreview.src) { resultCapture.textContent = '먼저 촬영해주세요.'; return; }
  await analyzeImageElement(capturePreview, resultCapture);
});

stopCamBtn.addEventListener('click', () => {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
  }
  video.srcObject = null;
  capturePreview.src = '';
  capturePreview.style.display = 'none';
  setButtonDisabled(startCamBtn, false);
  setButtonDisabled(stopCamBtn, true);
  setButtonDisabled(captureBtn, true);
  setButtonDisabled(retakeBtn, true);
  setButtonDisabled(analyzeCaptureBtn, true);
  clearResult(resultCapture);
  setStatus('카메라가 종료되었습니다.');
});

// 초기 실행
initModel();
