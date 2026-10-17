// Compatibility shim: teachablemachine-pose expects tf.fromPixels.
// If tf.fromPixels is missing but tf.browser.fromPixels exists, patch it.
if (window.tf && !tf.fromPixels && tf.browser && typeof tf.browser.fromPixels === 'function') {
  tf.fromPixels = tf.browser.fromPixels;
  console.log('shim: tf.fromPixels patched from tf.browser.fromPixels');
}

const MODEL_BASE = "./";
let model = null;
let isAnalyzingFile = false;
let isAnalyzingCapture = false;
let stream = null;

const statusEl = document.getElementById("status");
const fileInput = document.getElementById("fileInput");
const filePreview = document.getElementById("filePreview");
const analyzeFileBtn = document.getElementById("analyzeFileBtn");
const resultFile = document.getElementById("resultFile");

const startCamBtn = document.getElementById("startCamBtn");
const stopCamBtn = document.getElementById("stopCamBtn");
const captureBtn = document.getElementById("captureBtn");
const retakeBtn = document.getElementById("retakeBtn");
const analyzeCaptureBtn = document.getElementById("analyzeCaptureBtn");
const video = document.getElementById("video");
const captureCanvas = document.getElementById("captureCanvas");
const capturePreview = document.getElementById("capturePreview");
const resultCapture = document.getElementById("resultCapture");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#d94b4b" : "#666";
}

function setButtonDisabled(button, disabled) {
  button.disabled = disabled;
}

function clearTextResult(el) {
  el.innerHTML = "";
}

function isCorrectPredictionClass(className = "") {
  const normalized = className.toLowerCase();
  return /올바른|correct|good|정상|right/.test(normalized);
}

async function waitForImageLoad(imageElement) {
  return new Promise((resolve, reject) => {
    if (!imageElement) {
      reject(new Error("이미지 요소가 없습니다."));
      return;
    }

    if (imageElement.complete && imageElement.naturalWidth > 0) {
      resolve(imageElement);
      return;
    }

    imageElement.onload = () => resolve(imageElement);
    imageElement.onerror = () => reject(new Error("이미지 로드에 실패했습니다. 올바른 이미지를 선택해 주세요."));
  });
}

async function loadModel() {
  try {
    setStatus("모델을 로드하는 중입니다...");
    const modelURL = MODEL_BASE + "model.json";
    const metadataURL = MODEL_BASE + "metadata.json";

    model = await tmPose.load(modelURL, metadataURL);
    console.log("모델 로드 성공", { modelURL, metadataURL, model });

    setStatus("모델 로드 완료. 사진 또는 웹캠 캡처를 분석할 수 있습니다.");
  } catch (error) {
    console.error("모델 로드 실패:", error);
    setStatus("모델 로드에 실패했습니다. model.json 또는 metadata.json 경로를 확인해 주세요.", true);
    throw error;
  }
}

async function analyzePoseFromImage(imageElement, resultContainer, analysisKey) {
  if (!model) {
    resultContainer.innerHTML = "모델이 아직 로드되지 않았습니다.";
    return;
  }

  const isBusy = analysisKey === "file" ? isAnalyzingFile : isAnalyzingCapture;
  if (isBusy) {
    return;
  }

  if (analysisKey === "file") {
    isAnalyzingFile = true;
    setButtonDisabled(analyzeFileBtn, true);
  } else {
    isAnalyzingCapture = true;
    setButtonDisabled(analyzeCaptureBtn, true);
  }

  clearTextResult(resultContainer);

  try {
    setStatus("이미지에서 포즈를 추정하고 있습니다...");
    const loadedImage = await waitForImageLoad(imageElement);
    console.log("분석 시작 이미지 정보", {
      width: loadedImage.naturalWidth,
      height: loadedImage.naturalHeight,
      src: loadedImage.src,
      analysisKey
    });

    // Ensure tf.fromPixels exists at runtime
    if (window.tf && !tf.fromPixels && tf.browser && typeof tf.browser.fromPixels === 'function') {
      tf.fromPixels = tf.browser.fromPixels;
      console.log('shim: tf.fromPixels patched from tf.browser.fromPixels (runtime)');
    }

    const { pose, posenetOutput } = await model.estimatePose(loadedImage, false);
    console.log("포즈 추정 결과:", pose);

    const predictions = await model.predict(posenetOutput);
    console.log("모델 예측 결과:", predictions);

    if (!Array.isArray(predictions) || predictions.length === 0) {
      throw new Error("모델이 예측 결과를 반환하지 않았습니다.");
    }

    const sorted = [...predictions].sort((a, b) => b.probability - a.probability);
    const top = sorted[0];
    const isCorrect = isCorrectPredictionClass(top.className);

    setStatus("분석 완료");

    const resultBox = document.createElement("div");
    resultBox.className = "result-box";

    const topLine = document.createElement("div");
    topLine.className = `top ${isCorrect ? "good" : "bad"}`;
    topLine.textContent = isCorrect ? "올바른 스쿼트입니다." : "잘못된 스쿼트입니다.";

    const probLine = document.createElement("div");
    probLine.className = "prob-line";
    probLine.textContent = `예측 확률: ${(top.probability * 100).toFixed(1)}%`;

    const list = document.createElement("ul");
    list.className = "prob-list";

    sorted.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${item.className}</span><strong>${(item.probability * 100).toFixed(1)}%</strong>`;
      list.appendChild(li);
    });

    resultBox.appendChild(topLine);
    resultBox.appendChild(probLine);
    resultBox.appendChild(list);

    if (!isCorrect) {
      const correction = document.createElement("div");
      correction.className = "correction-box";
      correction.innerHTML = `
        <h4>올바른 스쿼트 자세 조건</h4>
        <ul>
          <li>발끝보다 무릎이 과하게 앞으로 나가지 않도록 합니다.</li>
          <li>척추를 중립으로 유지하고 허리가 굽지 않도록 합니다.</li>
          <li>무릎이 안쪽으로 모이지 않도록 합니다.</li>
        </ul>
      `;
      resultBox.appendChild(correction);
    }

    resultContainer.appendChild(resultBox);
  } catch (error) {
    console.error("이미지 분석 실패:", error);
    resultContainer.innerHTML = "사진 분석 중 오류가 발생했습니다. 다른 사진으로 다시 시도해 주세요.";
    setStatus("분석 실패. 이미지가 정상인지 확인해 주세요.", true);
  } finally {
    if (analysisKey === "file") {
      isAnalyzingFile = false;
      setButtonDisabled(analyzeFileBtn, !filePreview.src);
    } else {
      isAnalyzingCapture = false;
      setButtonDisabled(analyzeCaptureBtn, !capturePreview.src);
    }
  }
}

fileInput.addEventListener("change", (event) => {
  const selectedFile = event.target.files && event.target.files[0];
  if (!selectedFile) {
    filePreview.src = "";
    filePreview.style.display = "none";
    setButtonDisabled(analyzeFileBtn, true);
    clearTextResult(resultFile);
    return;
  }

  const objectURL = URL.createObjectURL(selectedFile);
  filePreview.src = objectURL;
  filePreview.style.display = "block";
  setButtonDisabled(analyzeFileBtn, false);
  clearTextResult(resultFile);
  console.log("업로드 이미지 선택됨", { fileName: selectedFile.name, size: selectedFile.size });
});

analyzeFileBtn.addEventListener("click", async () => {
  if (!filePreview.src) {
    resultFile.textContent = "분석할 사진을 먼저 업로드해 주세요.";
    return;
  }

  await analyzePoseFromImage(filePreview, resultFile, "file");
});

startCamBtn.addEventListener("click", async () => {
  try {
    setStatus("카메라 권한 요청 중...");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    setStatus("카메라 준비됨. 촬영 버튼을 눌러 정지 사진을 캡처하세요.");
    setButtonDisabled(startCamBtn, true);
    setButtonDisabled(stopCamBtn, false);
    setButtonDisabled(captureBtn, false);
  } catch (error) {
    console.error("카메라 시작 실패:", error);
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      setStatus("카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해 주세요.", true);
    } else {
      setStatus("카메라를 시작할 수 없습니다. 다른 브라우저나 기기에서 다시 시도해 주세요.", true);
    }
  }
});

captureBtn.addEventListener("click", () => {
  if (!stream) {
    resultCapture.textContent = "카메라가 실행 중이 아닙니다. 먼저 카메라를 시작해 주세요.";
    return;
  }

  if (!video.videoWidth || !video.videoHeight) {
    resultCapture.textContent = "촬영에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    return;
  }

  try {
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext("2d");
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

    const dataUrl = captureCanvas.toDataURL("image/png");
    capturePreview.src = dataUrl;
    capturePreview.style.display = "block";
    setButtonDisabled(analyzeCaptureBtn, false);
    setButtonDisabled(retakeBtn, false);
    clearTextResult(resultCapture);
    console.log("캡처 완료", { width: captureCanvas.width, height: captureCanvas.height });
  } catch (error) {
    console.error("캡처 실패:", error);
    resultCapture.textContent = "촬영 중 오류가 발생했습니다. 다시 시도해 주세요.";
  }
});

retakeBtn.addEventListener("click", () => {
  capturePreview.src = "";
  capturePreview.style.display = "none";
  setButtonDisabled(analyzeCaptureBtn, true);
  setButtonDisabled(retakeBtn, true);
  clearTextResult(resultCapture);
  setStatus("다시 촬영할 준비가 되었습니다. 촬영 버튼을 눌러 새 사진을 찍으세요.");
});

analyzeCaptureBtn.addEventListener("click", async () => {
  if (!capturePreview.src) {
    resultCapture.textContent = "먼저 웹캠으로 사진을 촬영해 주세요.";
    return;
  }

  await analyzePoseFromImage(capturePreview, resultCapture, "capture");
});

stopCamBtn.addEventListener("click", () => {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  if (video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
  }
  video.srcObject = null;

  capturePreview.src = "";
  capturePreview.style.display = "none";
  setButtonDisabled(startCamBtn, false);
  setButtonDisabled(stopCamBtn, true);
  setButtonDisabled(captureBtn, true);
  setButtonDisabled(retakeBtn, true);
  setButtonDisabled(analyzeCaptureBtn, true);
  clearTextResult(resultCapture);
  setStatus("카메라가 종료되었습니다.");
});

(async function initApp() {
  try {
    await loadModel();
  } catch (error) {
    console.error("앱 초기화 오류:", error);
  }

  filePreview.style.display = "none";
  capturePreview.style.display = "none";
  setButtonDisabled(analyzeFileBtn, true);
  setButtonDisabled(analyzeCaptureBtn, true);
  setButtonDisabled(retakeBtn, true);
  setButtonDisabled(captureBtn, true);
  setButtonDisabled(stopCamBtn, true);
})();
