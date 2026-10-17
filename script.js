// script.js
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

// 초기화: 모델 로드
async function initModel(){
  try{
    statusEl.textContent = "모델을 로드하는 중입니다...";
    const modelURL = MODEL_PATH + "model.json";
    const metadataURL = MODEL_PATH + "metadata.json";
    model = await tmPose.load(modelURL, metadataURL);
    // metadata.json에서 클래스 이름을 직접 읽음 (런타임에 표시)
    const resp = await fetch(metadataURL);
    metadata = await resp.json();
    classLabels = metadata.labels || metadata.class_names || [];
    maxPredictions = model.getTotalClasses();

    statusEl.textContent = "모델 로드 완료";
    modelInfoEl.innerHTML = `
      <div>모델 이름: ${metadata.modelName || "알 수 없음"}</div>
      <div>클래스 수: ${maxPredictions}</div>
      <div>클래스: ${classLabels.join(", ")}</div>
    `;
  }catch(err){
    console.error(err);
    statusEl.textContent = "모델 로드 실패: 모델 파일을 찾을 수 없거나 읽는 중 오류가 발생했습니다.";
    modelInfoEl.textContent = "metadata.json과 model.json이 저장소 루트에 있는지 확인하세요.";
  }
}

// 이미지(HTMLImageElement)로부터 예측 수행
async function analyzeImageElement(imgEl, resultContainer){
  resultContainer.innerHTML = "";
  if(!model){
    resultContainer.textContent = "모델이 준비되지 않았습니다.";
    return;
  }
  try{
    statusEl.textContent = "이미지에서 포즈를 추정하고 있습니다...";
    // estimatePose(image, flipHorizontal)
    const {pose, posenetOutput} = await model.estimatePose(imgEl, false);
    statusEl.textContent = "예측 중...";
    const predictions = await model.predict(posenetOutput);

    // 정렬하여 상위 예측 표시
    predictions.sort((a,b)=>b.probability-a.probability);
    const top = predictions[0];

    // 결과 표시
    const container = document.createElement("div");
    container.innerHTML = `<div class="top">최종 예측: ${top.className} (${(top.probability*100).toFixed(1)}%)</div>`;
    const ul = document.createElement("ul");
    ul.className = "prob-list";
    predictions.forEach(p=>{
      const li = document.createElement("li");
      li.innerHTML = `<span>${p.className}</span><strong>${(p.probability*100).toFixed(1)}%</strong>`;
      ul.appendChild(li);
    });
    container.appendChild(ul);
    resultContainer.appendChild(container);
    statusEl.textContent = "분석 완료";
  }catch(err){
    console.error(err);
    resultContainer.textContent = "사진 분석 중 오류가 발생했습니다.";
    statusEl.textContent = "분석 실패";
  }
}

/* --- 파일 업로드 흐름 --- */
fileInput.addEventListener("change", (ev)=>{
  const f = ev.target.files && ev.target.files[0];
  if(!f){ filePreview.src=""; analyzeFileBtn.disabled = true; return; }
  const url = URL.createObjectURL(f);
  filePreview.src = url;
  analyzeFileBtn.disabled = false;
  resultFile.innerHTML = "";
});

analyzeFileBtn.addEventListener("click", async ()=>{
  if(!filePreview.src){
    resultFile.textContent = "분석할 사진을 업로드 해 주세요.";
    return;
  }
  await analyzeImageElement(filePreview, resultFile);
});

/* --- 웹캠 흐름 --- */
startCamBtn.addEventListener("click", async ()=>{
  try{
    statusEl.textContent = "카메라 권한 요청 중...";
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}, audio:false});
    video.srcObject = stream;
    await video.play();
    stopCamBtn.disabled = false;
    captureBtn.disabled = false;
    startCamBtn.disabled = true;
    statusEl.textContent = "카메라 준비됨 (실시간 분석은 하지 않습니다).";
  }catch(err){
    console.error(err);
    if(err.name === "NotAllowedError" || err.name === "SecurityError"){
      statusEl.textContent = "카메라 권한이 거부되었습니다. 설정에서 권한을 허용해 주세요.";
    }else{
      statusEl.textContent = "카메라를 시작하는 중 오류가 발생했습니다.";
    }
  }
});

captureBtn.addEventListener("click", ()=>{
  if(!stream){ resultCapture.textContent = "카메라가 실행 중이 아닙니다."; return; }
  // 캔버스에 현재 비디오 프레임을 그려서 이미지로 변환
  const w = video.videoWidth;
  const h = video.videoHeight;
  if(!w || !h){
    resultCapture.textContent = "촬영에 실패했습니다. 잠시 후 다시 시도하세요.";
    return;
  }
  captureCanvas.width = w;
  captureCanvas.height = h;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = captureCanvas.toDataURL("image/png");
  capturePreview.src = dataUrl;
  analyzeCaptureBtn.disabled = false;
  retakeBtn.disabled = false;
  resultCapture.innerHTML = "";
});

retakeBtn.addEventListener("click", ()=>{
  capturePreview.src = "";
  analyzeCaptureBtn.disabled = true;
  retakeBtn.disabled = true;
  resultCapture.innerHTML = "";
});

analyzeCaptureBtn.addEventListener("click", async ()=>{
  if(!capturePreview.src){
    resultCapture.textContent = "먼저 촬영해주세요.";
    return;
  }
  await analyzeImageElement(capturePreview, resultCapture);
});

stopCamBtn.addEventListener("click", ()=>{
  if(stream){
    stream.getTracks().forEach(t=>t.stop());
    stream = null;
  }
  video.srcObject = null;
  startCamBtn.disabled = false;
  stopCamBtn.disabled = true;
  captureBtn.disabled = true;
  retakeBtn.disabled = true;
  analyzeCaptureBtn.disabled = true;
  statusEl.textContent = "카메라 종료됨";
});

/* 초기 실행 */
initModel();
